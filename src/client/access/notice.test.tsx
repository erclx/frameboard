import '../styles.css'

import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'

import { modeStore } from '@/client/board/mode'
import { toast, Toaster } from '@/client/components/ui/toast'
import { liveStore } from '@/client/live/store'
import { contrastOnPage } from '@/test/contrast'
import { ringFocused } from '@/test/focus-ring'
import { contrastHovered } from '@/test/hover-contrast'
import { emulateReducedMotion } from '@/test/motion'

import type { EditAccessProps } from './edit-access'
import { askToEdit, closeEditAccess } from './edit-store'
import { toastExpired } from './expired-link'
import { ViewOnlyNotice } from './notice'

const COPY = 'View only. Run frameboard open to edit'

function renderAt(path: string, props: EditAccessProps = {}) {
  render(
    <Router hook={memoryLocation({ path }).hook}>
      <ViewOnlyNotice {...props} />
    </Router>,
  )
}

function live(state: Partial<ReturnType<typeof liveStore.getState>>): void {
  act(() => liveStore.setState(state))
}

afterEach(() => {
  act(() => {
    liveStore.setState({
      connected: false,
      canWrite: false,
      accessKnown: false,
      editButton: false,
    })
    modeStore.setState({ mode: 'edit' })
    closeEditAccess()
  })
})

describe('ViewOnlyNotice', () => {
  it('says the tab reads and names the fix once the server answers no', () => {
    live({ connected: true, accessKnown: true, canWrite: false })
    renderAt('/')

    expect(screen.getByRole('status')).toHaveTextContent(COPY)
  })

  it('shows nothing before the first answer', () => {
    live({ connected: true, accessKnown: false, canWrite: false })
    renderAt('/')

    expect(screen.queryByText(COPY)).toBeNull()
  })

  it('shows nothing in a tab that writes', () => {
    live({ connected: true, accessKnown: true, canWrite: true })
    renderAt('/')

    expect(screen.queryByText(COPY)).toBeNull()
  })

  it('leaves the slot to Reconnecting while the socket is down', () => {
    live({ connected: false, accessKnown: false, canWrite: false })
    renderAt('/')

    expect(screen.queryByText(COPY)).toBeNull()
  })

  it('appears when a writing tab loses its cookie on a restart', () => {
    live({ connected: true, accessKnown: true, canWrite: true })
    renderAt('/')

    live({ connected: false, accessKnown: false, canWrite: false })
    live({ connected: true, accessKnown: true, canWrite: false })

    expect(screen.getByRole('status')).toHaveTextContent(COPY)
  })

  it('steps aside for the Play banner on the board', () => {
    live({ connected: true, accessKnown: true, canWrite: false })
    act(() => modeStore.setState({ mode: 'play' }))
    renderAt('/p/studio/home')

    expect(screen.queryByText(COPY)).toBeNull()
  })

  it('still shows on home while the mode left behind reads Play', () => {
    live({ connected: true, accessKnown: true, canWrite: false })
    act(() => modeStore.setState({ mode: 'play' }))
    renderAt('/')

    expect(screen.getByRole('status')).toHaveTextContent(COPY)
  })
})

describe('the Edit button', () => {
  beforeEach(() => {
    live({
      connected: true,
      accessKnown: true,
      canWrite: false,
      editButton: true,
    })
  })

  const pill = () => screen.getByRole('status')
  const button = () =>
    within(pill()).getByRole('button', { name: 'Edit this board' })
  const focused = () => document.activeElement as HTMLElement
  const dialog = () => screen.findByRole('dialog', { name: 'Edit this board?' })

  function answering(status: number, body: unknown) {
    return vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify(body), { status }),
    )
  }

  const granted = () => answering(200, { ok: true, data: { write: true } })

  async function open(props: EditAccessProps = {}): Promise<HTMLElement> {
    renderAt('/', props)
    await userEvent.click(button())
    return dialog()
  }

  it('stands in the pill in place of the command', () => {
    renderAt('/')

    expect(pill()).toHaveTextContent(/^View only/)
    expect(pill()).not.toHaveTextContent('frameboard open')
    expect(button()).toBeVisible()
  })

  it('is absent where the server does not offer it', () => {
    live({ editButton: false })
    renderAt('/')

    expect(screen.queryByRole('button')).toBeNull()
    expect(pill()).toHaveTextContent(COPY)
  })

  it('is absent in a tab that writes', () => {
    live({ canWrite: true })
    renderAt('/')

    expect(screen.queryByRole('button')).toBeNull()
  })

  it('sends nothing until the dialog is confirmed', async () => {
    const send = granted()

    const confirm = await open({ send })

    expect(confirm).toHaveTextContent(
      'This tab will be able to change the files in this board folder.',
    )
    expect(send).not.toHaveBeenCalled()
  })

  it.each([
    ['Cancel', () => userEvent.click(screen.getByText('Cancel'))],
    ['Escape', () => userEvent.keyboard('{Escape}')],
  ])(
    'closes on %s with nothing sent and focus back on the button',
    async (_case, leave) => {
      const send = granted()
      const confirm = await open({ send })

      await leave()

      await waitFor(() => expect(confirm).not.toBeInTheDocument())
      expect(send).not.toHaveBeenCalled()
      await waitFor(() => expect(button()).toHaveFocus())
    },
  )

  it('keeps Tab inside the dialog', async () => {
    const confirm = await open()
    const cancel = within(confirm).getByRole('button', { name: 'Cancel' })
    await waitFor(() => expect(cancel).toHaveFocus())

    await userEvent.tab()
    expect(within(confirm).getByRole('button', { name: 'Edit' })).toHaveFocus()

    await userEvent.tab()
    await waitFor(() => expect(confirm).toContainElement(focused()))
  })

  it('posts JSON to the grant and reloads the tab once granted', async () => {
    const send = granted()
    const reload = vi.fn()
    const confirm = await open({ send, reload })

    await userEvent.click(within(confirm).getByRole('button', { name: 'Edit' }))

    await waitFor(() => expect(reload).toHaveBeenCalledOnce())
    const [path, init] = send.mock.calls[0] ?? []
    expect(path).toBe('/api/access/edit')
    expect(init).toMatchObject({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    })
  })

  it.each([
    [
      'the refusal',
      answering(403, {
        ok: false,
        error: { code: 'forbidden', message: 'Only this board may ask.' },
      }),
      'Only this board may ask.',
    ],
    [
      'that the board did not answer',
      vi.fn<typeof fetch>(async () => {
        throw new TypeError('Failed to fetch')
      }),
      'The board did not answer.',
    ],
    [
      'the status of an answer it cannot read',
      vi.fn<typeof fetch>(
        async () => new Response('404 Not Found', { status: 404 }),
      ),
      'The board answered 404.',
    ],
  ])('says %s and stays view only', async (_case, send, why) => {
    const reload = vi.fn()
    const confirm = await open({ send, reload })

    await userEvent.click(within(confirm).getByRole('button', { name: 'Edit' }))

    expect(await within(confirm).findByRole('alert')).toHaveTextContent(
      `${why} This tab stays view only. Run frameboard open to edit.`,
    )
    expect(reload).not.toHaveBeenCalled()
  })

  it('drops the last refusal when it opens again', async () => {
    const confirm = await open({
      send: answering(403, {
        ok: false,
        error: { code: 'forbidden', message: 'Only this board may ask.' },
      }),
    })
    await userEvent.click(within(confirm).getByRole('button', { name: 'Edit' }))
    await within(confirm).findByRole('alert')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(confirm).not.toBeInTheDocument())

    await userEvent.click(button())

    expect(within(await dialog()).queryByRole('alert')).toBeNull()
  })

  it('closes with the socket and stays closed once it is back', async () => {
    const confirm = await open()

    live({ connected: false, accessKnown: false, editButton: false })
    await waitFor(() => expect(confirm).not.toBeInTheDocument())
    live({ connected: true, accessKnown: true, editButton: true })

    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('drops a refusal that came back after the socket closed it', async () => {
    let fail = (_error: Error) => {}
    const send = vi.fn<typeof fetch>(
      () => new Promise((_resolve, reject) => (fail = reject)),
    )
    const confirm = await open({ send })
    await userEvent.click(within(confirm).getByRole('button', { name: 'Edit' }))
    live({ connected: false, accessKnown: false, editButton: false })
    await waitFor(() => expect(confirm).not.toBeInTheDocument())
    await act(async () => fail(new TypeError('Failed to fetch')))
    live({ connected: true, accessKnown: true, editButton: true })

    await userEvent.click(button())

    expect(within(await dialog()).queryByRole('alert')).toBeNull()
  })

  it('stays closed on a reconnect after an ask the socket was down for', async () => {
    live({ connected: false, accessKnown: false, editButton: false })
    renderAt('/')
    act(() => askToEdit())

    live({ connected: true, accessKnown: true, editButton: true })

    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('keeps the pill on one line in a narrow tab', () => {
    renderAt('/')
    const { left, right } = pill().getBoundingClientRect()

    expect(pill().getBoundingClientRect().height).toBeLessThan(44)
    expect(right - left).toBeLessThanOrEqual(320)
  })

  describe.each(['light', 'dark'])('in %s', (theme) => {
    beforeEach(() => {
      document.documentElement.classList.add(theme)
    })

    afterEach(async () => {
      document.documentElement.classList.remove(theme)
      await emulateReducedMotion(false)
    })

    it('reads at rest and hovered', async () => {
      renderAt('/')

      expect(contrastOnPage(pill())).toBeGreaterThanOrEqual(4.5)
      expect(contrastOnPage(button())).toBeGreaterThanOrEqual(4.5)
      expect(await contrastHovered(button())).toBeGreaterThanOrEqual(4.5)
    })

    it('rings under keyboard focus', async () => {
      // The ring fades in, so it is read with motion off.
      await emulateReducedMotion(true)
      renderAt('/')

      expect(await ringFocused(button())).toBeGreaterThanOrEqual(3)
    })

    it('holds still under reduced motion', async () => {
      await emulateReducedMotion(true)
      renderAt('/')

      expect(getComputedStyle(button()).transitionProperty).toBe('none')
    })
  })
})

describe('the expired link toast', () => {
  afterEach(() => act(() => toast.close()))

  function raise(editButton: boolean) {
    live({ connected: true, accessKnown: true, canWrite: false, editButton })
    renderAt('/')
    render(<Toaster />)
    act(() => toastExpired(editButton))
  }

  it('opens the confirmation and leaves where the server offers the button', async () => {
    raise(true)
    const raised = await screen.findByRole('dialog', {
      name: 'This edit link has expired',
    })

    await userEvent.click(
      within(raised).getByRole('button', { name: 'Edit this board' }),
    )

    expect(
      await screen.findByRole('dialog', { name: 'Edit this board?' }),
    ).toBeInTheDocument()
    await waitFor(() => expect(raised).not.toBeInTheDocument())
  })

  it('answers a press the server no longer offers with the command', async () => {
    raise(true)
    const raised = await screen.findByRole('dialog', {
      name: 'This edit link has expired',
    })
    live({ connected: false, accessKnown: false, editButton: false })

    await userEvent.click(
      within(raised).getByRole('button', { name: 'Edit this board' }),
    )

    expect(
      await within(raised).findByText(/Run frameboard open for a new one/),
    ).toBeVisible()
    expect(
      within(raised).queryByRole('button', { name: 'Edit this board' }),
    ).toBeNull()
  })

  it('names the command where it does not', async () => {
    raise(false)

    expect(
      await screen.findByText(/Run frameboard open for a new one/),
    ).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Edit this board' })).toBeNull()
  })
})
