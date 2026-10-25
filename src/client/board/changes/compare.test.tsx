import '../../styles.css'

import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { bindKeys } from '@/client/actions/registry'
import { toast, Toaster } from '@/client/components/ui/toast'
import { receiveChanges, unseenStore } from '@/client/live/unseen'
import { flipFrame, themeStore } from '@/client/theme/store'
import type { FrameChange } from '@/shared/records/changes'
import type { FrameRecord } from '@/shared/records/list'

import { Frame } from '../frame'
import { modeStore } from '../mode'
import { clear, select, selectionStore } from '../selection'
import { compareStore, useCompareActions } from './compare'

const PRICING = 'studio/home/pricing'
const BEFORE = 'b'.repeat(64)
const NOW = 'c'.repeat(64)

function pricing(): FrameRecord {
  return {
    ref: PRICING,
    project: 'studio',
    page: 'home',
    name: 'pricing',
    path: '/board/studio/home/pricing.html',
    box: { x: 0, y: 0, width: 300, height: 200 },
    order: 0,
    hidden: false,
    locked: false,
    hugWidth: false,
    hugHeight: false,
    placed: true,
    modifiedAt: '2026-10-25T00:00:00.000Z',
  }
}

function agentChange(overrides: Partial<FrameChange> = {}): FrameChange {
  return {
    id: 'c1',
    frame: PRICING,
    at: '2026-10-25T12:00:00.000Z',
    hash: NOW,
    author: { session: 's-1', agent: 'claude', tag: 'claude · studio' },
    elements: [4],
    removed: 0,
    whole: false,
    created: false,
    before: BEFORE,
    ...overrides,
  }
}

/** The server holding the versions named, answering 404 for every other. */
function serverHolding(...hashes: string[]) {
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const at = new URL(String(input), location.href).searchParams.get('at')
    return new Response(null, {
      status: at && hashes.includes(at) ? 200 : 404,
    })
  })
}

function Board() {
  useCompareActions()
  return (
    <Toaster>
      <Frame frame={pricing()} live version={0} />
    </Toaster>
  )
}

const live = () =>
  document.querySelector<HTMLIFrameElement>(
    `[data-frame="${PRICING}"] iframe[title="pricing"]`,
  )
const before = () =>
  document.querySelector<HTMLIFrameElement>('iframe[title="pricing before"]')

describe('compare', () => {
  let unbind = () => {}

  beforeEach(() => {
    unbind = bindKeys(window)
  })

  afterEach(() => {
    unbind()
    vi.unstubAllGlobals()
    act(() => {
      toast.close()
      clear(selectionStore)
      modeStore.setState({ mode: 'edit', tool: 'move' })
      unseenStore.setState({ unseen: {}, base: {}, cursor: null })
      compareStore.setState({ ref: null, hash: null, mode: 'flip' })
    })
  })

  it('offers no compare for a frame the agent created', () => {
    act(() =>
      receiveChanges(unseenStore, [
        agentChange({ created: true, whole: true, before: undefined }),
      ]),
    )

    render(<Board />)

    expect(
      screen.queryByRole('button', { name: 'Compare pricing with before' }),
    ).toBeNull()
  })

  it('flips to the version before over the live frame and back', async () => {
    serverHolding(BEFORE)
    act(() => receiveChanges(unseenStore, [agentChange()]))
    render(<Board />)
    const liveSrc = live()?.getAttribute('src')

    await userEvent.click(
      screen.getByRole('button', { name: 'Compare pricing with before' }),
    )
    await waitFor(() => expect(before()).not.toBeNull())
    const shown = new URL(before()?.src ?? '')
    await userEvent.click(screen.getByRole('radio', { name: 'Now' }))

    expect(shown.searchParams.get('at')).toBe(BEFORE)
    expect(shown.searchParams.get('theme')).toBe('light')
    expect(before()).toBeNull()
    expect(live()?.getAttribute('src')).toBe(liveSrc)
  })

  it('splits at a divider the arrow keys move', async () => {
    serverHolding(BEFORE)
    act(() => receiveChanges(unseenStore, [agentChange()]))
    render(<Board />)
    await userEvent.click(
      screen.getByRole('button', { name: 'Compare pricing with before' }),
    )
    await userEvent.click(await screen.findByRole('radio', { name: 'Split' }))

    const divider = screen.getByRole('slider')
    divider.focus()
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}')

    expect(divider.getAttribute('aria-valuenow')).toBe('40')
    expect(
      document.querySelector<HTMLElement>('[data-compare-before]')?.style
        .clipPath,
    ).toBe('inset(0px calc(60%) 0px 0px)')
  })

  it('ends on Esc', async () => {
    serverHolding(BEFORE)
    act(() => receiveChanges(unseenStore, [agentChange()]))
    render(<Board />)
    await userEvent.click(
      screen.getByRole('button', { name: 'Compare pricing with before' }),
    )
    await waitFor(() => expect(before()).not.toBeNull())

    await userEvent.keyboard('{Escape}')

    expect(before()).toBeNull()
  })

  it.each([
    ['a selection', () => select(selectionStore, 'studio/home', [PRICING])],
    ['entering Play', () => modeStore.setState({ mode: 'play' })],
    ['the Note tool', () => modeStore.setState({ tool: 'note' })],
  ])('ends on %s', async (_case, run) => {
    serverHolding(BEFORE)
    act(() => receiveChanges(unseenStore, [agentChange()]))
    render(<Board />)
    await userEvent.click(
      screen.getByRole('button', { name: 'Compare pricing with before' }),
    )
    await waitFor(() => expect(before()).not.toBeNull())

    act(run)

    expect(compareStore.getState().ref).toBeNull()
  })

  it('follows a theme flipped on the frame alone', async () => {
    serverHolding(BEFORE)
    act(() => receiveChanges(unseenStore, [agentChange()]))
    render(<Board />)
    await userEvent.click(
      screen.getByRole('button', { name: 'Compare pricing with before' }),
    )
    await waitFor(() => expect(before()).not.toBeNull())

    act(() => flipFrame(PRICING, themeStore))

    await waitFor(() =>
      expect(
        before()?.contentDocument?.documentElement.getAttribute('data-theme'),
      ).toBe('dark'),
    )
    act(() => flipFrame(PRICING, themeStore))
  })

  it('drops the control and says so once the server no longer holds the version', async () => {
    serverHolding()
    act(() => receiveChanges(unseenStore, [agentChange()]))
    render(<Board />)

    await userEvent.click(
      screen.getByRole('button', { name: 'Compare pricing with before' }),
    )

    expect(await screen.findByText('The version before is gone')).toBeTruthy()
    expect(before()).toBeNull()
    expect(
      screen.queryByRole('button', { name: 'Compare pricing with before' }),
    ).toBeNull()
  })

  it('keeps the control once the developer looks at the frame', async () => {
    act(() => receiveChanges(unseenStore, [agentChange()]))
    render(<Board />)

    act(() => {
      unseenStore.setState({ unseen: {} })
    })

    expect(
      screen.getByRole('button', { name: 'Compare pricing with before' }),
    ).toBeTruthy()
  })
})
