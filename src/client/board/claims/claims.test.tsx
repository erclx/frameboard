import '../../styles.css'

import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { liveStore, receiveClaims } from '@/client/live/store'
import type { Claim } from '@/shared/records/claims'
import type { Listener } from '@/shared/records/notes'
import { frameOf } from '@/test/board'

import { followStore, stopFollow } from '../changes/follow'
import { Frame } from '../frame'
import { dropPending, holdBoxes } from '../geometry/write'
import { modeStore } from '../mode'
import { ClaimAvatars } from './avatars'
import { elapsed } from './label'
import {
  afterClaims,
  dropWaiting,
  type EditLabel,
  WaitDropped,
} from './waiting'
import { WaitingCards, WaitingDock } from './waiting-card'

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
  afterEach(() => {
    act(() => stopFollow())
  })

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
      screen.getByRole('button', { name: 'claude · visual-style, editing' }),
    ).toHaveAttribute('data-editing')
    expect(
      screen.getByRole('button', { name: 'codex · visual-style, listening' }),
    ).not.toHaveAttribute('data-editing')
  })

  it('shows each session by the first letter of its agent', () => {
    render(
      <ClaimAvatars
        listeners={[listener('sess-b', 'codex · visual-style')]}
        claims={{}}
      />,
    )

    expect(screen.getByRole('button').textContent).toBe('C')
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
      screen.getAllByRole('button').map((avatar) => avatar.textContent),
    ).toEqual(['G', 'C'])
  })

  it('leaves off a claim holder that is not listening', () => {
    render(
      <ClaimAvatars
        listeners={[listener('sess-b', 'codex · visual-style')]}
        claims={{ 'studio/home/hero': claimBy('sess-a') }}
      />,
    )

    expect(screen.getAllByRole('button')).toHaveLength(1)
  })

  it('draws the Following chip in place of an initial once clicked', async () => {
    render(
      <ClaimAvatars
        listeners={[listener('sess-b', 'codex · visual-style')]}
        claims={{}}
      />,
    )
    const avatar = screen.getByRole('button', {
      name: 'codex · visual-style, listening',
    })

    await userEvent.click(avatar)

    expect(avatar).toHaveAttribute('aria-pressed', 'true')
    expect(avatar).toHaveTextContent('Following')
    expect(followStore.getState().session).toBe('sess-b')
  })

  it('stops following on a second click', async () => {
    render(
      <ClaimAvatars
        listeners={[listener('sess-b', 'codex · visual-style')]}
        claims={{}}
      />,
    )
    const avatar = screen.getByRole('button', {
      name: 'codex · visual-style, listening',
    })
    await userEvent.click(avatar)

    await userEvent.click(avatar)

    expect(avatar).toHaveAttribute('aria-pressed', 'false')
    expect(avatar).not.toHaveTextContent('Following')
    expect(followStore.getState().session).toBeNull()
  })
})

describe('the waiting card', () => {
  const HERO = frameOf('hero')

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
    vi.setSystemTime(NOW)
    act(() => {
      liveStore.setState({ connected: true })
      receiveClaims(liveStore, [claimBy('sess-a', HERO.ref)])
    })
  })

  afterEach(() => {
    act(() => {
      dropWaiting()
      receiveClaims(liveStore, [])
    })
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    act(() => modeStore.setState({ mode: 'edit' }))
  })

  /** Starts an edit of `label` on the hero, resolving with how its wait ended. */
  function startEdit(label: EditLabel): Promise<unknown> {
    let ended: Promise<unknown> = Promise.resolve()
    act(() => {
      ended = afterClaims([HERO.ref], label).then(
        () => 'sent',
        (error: unknown) => error,
      )
    })
    return ended
  }

  it.each([
    ['move', 'Your move will wait until it finishes, about 40s so far.'],
    ['resize', 'Your resize will wait until it finishes, about 40s so far.'],
    ['edit', 'Your edit will wait until it finishes, about 40s so far.'],
    ['rename', 'Your rename will wait until it finishes, about 40s so far.'],
    ['delete', 'Your delete will wait until it finishes, about 40s so far.'],
    ['undo', 'Your undo will wait until it finishes, about 40s so far.'],
  ] as const)('names the holder and says a %s waits', async (label, line) => {
    render(<WaitingCards page="studio/home" frames={[HERO]} />)

    const ended = startEdit(label)

    expect(screen.getByRole('status').textContent).toBe(
      `Claude · visual-style is editing hero${line}`,
    )
    act(() => dropWaiting())
    await ended
  })

  it('sits at the box a waiting move dropped the frame at', async () => {
    act(() =>
      holdBoxes({ [HERO.ref]: { ...HERO.box, x: 400, y: 0, height: 300 } }),
    )
    render(<WaitingCards page="studio/home" frames={[HERO]} />)
    const ended = startEdit('move')

    const placed = screen.getByRole('status').parentElement?.style

    expect(placed?.left).toContain('400px')
    expect(placed?.top).toContain('300px')
    act(() => {
      dropWaiting()
      dropPending([HERO.ref])
    })
    await ended
  })

  it('counts on each second while the edit waits', async () => {
    render(<WaitingCards page="studio/home" frames={[HERO]} />)
    const ended = startEdit('move')

    act(() => vi.advanceTimersByTime(30_000))

    expect(document.querySelector('[data-waiting-elapsed]')?.textContent).toBe(
      '1m',
    )
    act(() => dropWaiting())
    await ended
  })

  it('closes once the claim is released, sending the edit', async () => {
    render(<WaitingCards page="studio/home" frames={[HERO]} />)
    const ended = startEdit('move')

    act(() => receiveClaims(liveStore, []))

    expect(await ended).toBe('sent')
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('closes and cancels the edit on Esc', async () => {
    render(<WaitingCards page="studio/home" frames={[HERO]} />)
    const ended = startEdit('move')

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })

    expect(await ended).toBeInstanceOf(WaitDropped)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('cancels the edit on Play', async () => {
    render(<WaitingCards page="studio/home" frames={[HERO]} />)
    const ended = startEdit('move')

    act(() => modeStore.setState({ mode: 'play' }))

    expect(await ended).toBeInstanceOf(WaitDropped)
  })

  it('cancels the edit when the canvas leaves the page', async () => {
    const { rerender } = render(
      <WaitingCards page="studio/home" frames={[HERO]} />,
    )
    const ended = startEdit('move')

    rerender(<WaitingCards page="studio/pricing" frames={[]} />)

    expect(await ended).toBeInstanceOf(WaitDropped)
  })

  it('docks the card of a frame the page does not show', async () => {
    render(<WaitingDock frames={[]} />)

    const ended = startEdit('rename')

    expect(
      document.querySelector('[data-waiting-dock] [role="status"]')
        ?.textContent,
    ).toBe(
      'Claude · visual-style is editing heroYour rename will wait until it finishes, about 40s so far.',
    )
    act(() => dropWaiting())
    await ended
  })
})
