import '../../styles.css'

import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Claim } from '@/shared/records/claims'
import type { Listener } from '@/shared/records/notes'
import { frameOf } from '@/test/board'

import { Frame } from '../frame'
import { modeStore } from '../mode'
import { ClaimAvatars } from './avatars'
import { elapsed } from './label'

const NOW = new Date('2026-10-19T10:00:40.000Z')

function claimBy(session: string, frame = 'studio/home/hero'): Claim {
  return {
    frame,
    session,
    agent: 'claude',
    tag: 'claude · visual-style',
    claimedAt: '2026-10-19T10:00:00.000Z',
    expiresAt: '2026-10-19T10:05:00.000Z',
  }
}

function listener(session: string, tag: string): Listener {
  return { session, tag, since: '2026-10-19T09:59:00.000Z' }
}

describe('the claim tag on a frame label', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    act(() => modeStore.setState({ mode: 'edit' }))
  })

  it('names the agent capitalized and how long it has held the frame', () => {
    const { container } = render(
      <Frame
        frame={frameOf('hero')}
        live={false}
        version={0}
        claim={claimBy('s')}
      />,
    )

    expect(container.querySelector('[data-claim-tag]')?.textContent).toBe(
      'CClaude · visual-styleediting · 40s',
    )
  })

  it('counts on each second while the claim holds', () => {
    render(
      <Frame
        frame={frameOf('hero')}
        live={false}
        version={0}
        claim={claimBy('s')}
      />,
    )

    act(() => vi.advanceTimersByTime(2000))

    expect(screen.getByText('editing · 42s')).toBeVisible()
  })

  it('outlines the claimed frame in Edit', () => {
    const { container } = render(
      <Frame
        frame={frameOf('hero')}
        live={false}
        version={0}
        claim={claimBy('s')}
      />,
    )

    expect(container.querySelector('[data-frame]')).toHaveAttribute(
      'data-claimed',
    )
  })

  it('keeps the outline 3px outside the frame on screen at any zoom', () => {
    const { container } = render(
      <div style={{ transform: 'scale(2)', ['--zoom' as string]: 2 }}>
        <Frame
          frame={frameOf('hero')}
          live={false}
          version={0}
          claim={claimBy('s')}
        />
      </div>,
    )
    const frame = container
      .querySelector('[data-frame]')
      ?.getBoundingClientRect()
    const outline = container
      .querySelector('[data-claim-outline]')
      ?.getBoundingClientRect()

    expect(outline?.left).toBeCloseTo((frame?.left ?? 0) - 3, 1)
    expect(outline?.width).toBeCloseTo((frame?.width ?? 0) + 6, 1)
  })

  it('draws the outline 1.5px wide on screen at any zoom', () => {
    const { container } = render(
      <div style={{ transform: 'scale(2)', ['--zoom' as string]: 2 }}>
        <Frame
          frame={frameOf('hero')}
          live={false}
          version={0}
          claim={claimBy('s')}
        />
      </div>,
    )
    const rect = container.querySelector('[data-claim-outline] rect')

    expect(rect && getComputedStyle(rect).strokeWidth).toBe('0.75px')
  })

  it('draws no outline and no tag in Play', () => {
    act(() => modeStore.setState({ mode: 'play' }))

    const { container } = render(
      <Frame
        frame={frameOf('hero')}
        live={false}
        version={0}
        claim={claimBy('s')}
      />,
    )

    expect(container.querySelector('[data-frame]')).not.toHaveAttribute(
      'data-claimed',
    )
    expect(container.querySelector('[data-claim-outline]')).toBeNull()
    expect(container.querySelector('[data-claim-tag]')).toBeNull()
  })

  it('draws nothing on a frame nobody holds', () => {
    const { container } = render(
      <Frame frame={frameOf('hero')} live={false} version={0} />,
    )

    expect(container.querySelector('[data-claim-tag]')).toBeNull()
  })
})

describe('elapsed', () => {
  it('reads whole minutes once a claim passes one', () => {
    expect(
      elapsed(
        '2026-10-19T10:00:00.000Z',
        Date.parse('2026-10-19T10:02:30.000Z'),
      ),
    ).toBe('2m')
  })
})

describe('ClaimAvatars', () => {
  it('draws a listening session holding a claim solid and one only listening pale', () => {
    render(
      <ClaimAvatars
        listeners={[
          listener('sess-a', 'claude · visual-style'),
          listener('sess-b', 'codex · visual-style'),
        ]}
        claims={{ 'studio/home/hero': claimBy('sess-a') }}
      />,
    )

    expect(
      screen.getByRole('img', { name: 'claude · visual-style, editing' }),
    ).toHaveAttribute('data-editing')
    expect(
      screen.getByRole('img', { name: 'codex · visual-style, listening' }),
    ).not.toHaveAttribute('data-editing')
  })

  it('shows each session by the first letter of its agent', () => {
    render(
      <ClaimAvatars
        listeners={[listener('sess-b', 'codex · visual-style')]}
        claims={{}}
      />,
    )

    expect(screen.getByRole('img').textContent).toBe('C')
  })

  it('reads the agent of each listener when the server swapped two shared tags for session ids', () => {
    render(
      <ClaimAvatars
        listeners={[listener('sess-a', 'sess-a'), listener('sess-b', 'sess-b')]}
        claims={{
          'studio/home/hero': { ...claimBy('sess-a'), agent: 'gemini' },
        }}
      />,
    )

    expect(
      screen.getAllByRole('img').map((avatar) => avatar.textContent),
    ).toEqual(['G', 'C'])
  })

  it('leaves off a claim holder that is not listening', () => {
    render(
      <ClaimAvatars
        listeners={[listener('sess-b', 'codex · visual-style')]}
        claims={{ 'studio/home/hero': claimBy('sess-a') }}
      />,
    )

    expect(screen.getAllByRole('img')).toHaveLength(1)
  })
})
