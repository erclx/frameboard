import '../../styles.css'

import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'

import {
  type Action,
  bindKeys,
  registerActions,
} from '@/client/actions/registry'

import { toast, Toaster } from './toast'

const cleanups: (() => void)[] = []

/** The close button's ring, which a focused toast draws outside its box. */
const RING = 3

/** Where the content of a toast with a close button ends, its 1px border and 34px padding. */
const END = 35

const box = (element: Element) => element.getBoundingClientRect()

/** How far an element ends from the right edge of the toast holding it. */
function fromEdge(element: Element): number {
  const root = element.closest('[data-slot="toast"]')
  return (root ? box(root).right : Number.NaN) - box(element).right
}

afterEach(() => {
  while (cleanups.length) cleanups.pop()?.()
  act(() => toast.close())
})

describe('the toast stack', () => {
  it('sits in the corner on a screen with no toolbar', () => {
    render(<Toaster />)

    const viewport = screen.getByRole('region', { name: /notifications/i })

    expect(getComputedStyle(viewport).bottom).toBe('16px')
  })
})

describe('a focused toast', () => {
  it('lets a board key run', async () => {
    let runs = 0
    const move: Action = {
      id: 'tool.move',
      label: 'Move',
      group: 'tool',
      palette: false,
      keys: ['v'],
      run: () => {
        runs += 1
      },
    }
    cleanups.push(registerActions([move]), bindKeys(window))
    render(<Toaster />)
    act(() => {
      toast.add({ title: 'Copied', timeout: 0 })
    })
    const raised = await screen.findByText('Copied')
    const root = raised.closest<HTMLElement>('[role="dialog"]')
    root?.focus()
    await waitFor(() => expect(document.activeElement).toBe(root))

    await userEvent.keyboard('v')

    expect(runs).toBe(1)
  })
})

describe('a held stack', () => {
  it('draws no toast and shows one still open once released', async () => {
    const { rerender } = render(<Toaster held />)
    act(() => {
      toast.add({ title: 'Deleted webapp', timeout: 0 })
    })
    const raised = await screen.findByText('Deleted webapp')
    expect(raised).not.toBeVisible()

    rerender(<Toaster />)

    await waitFor(() => expect(raised).toBeVisible())
  })

  it('leaves no notifications region for a screen reader', async () => {
    render(<Toaster held />)

    expect(screen.queryByRole('region')).toBeNull()
  })

  it('lays out two toasts raised while held clear of each other', async () => {
    const { rerender } = render(<Toaster held />)
    act(() => {
      toast.add({ title: 'First', timeout: 0 })
      toast.add({ title: 'Second', timeout: 0 })
    })
    await screen.findByText('Second')

    rerender(<Toaster />)

    await waitFor(() => {
      const first = screen.getByRole('dialog', { name: 'First' })
      const second = screen.getByRole('dialog', { name: 'Second' })
      expect(first.getBoundingClientRect().bottom).toBeLessThanOrEqual(
        second.getBoundingClientRect().top,
      )
    })
  })

  it('hides a toast already open and returns it', async () => {
    const { rerender } = render(<Toaster />)
    act(() => {
      toast.add({ title: 'Deleted webapp', timeout: 0 })
    })
    const raised = await screen.findByText('Deleted webapp')

    rerender(<Toaster held />)
    expect(raised).not.toBeVisible()

    rerender(<Toaster />)
    expect(raised).toBeVisible()
  })

  it('drops a toast closed while held', async () => {
    render(<Toaster held />)
    let id = ''
    act(() => {
      id = toast.add({ title: 'Deleted webapp', timeout: 0 })
    })
    await screen.findByText('Deleted webapp')

    act(() => toast.close(id))

    await waitFor(() => expect(screen.queryByText('Deleted webapp')).toBeNull())
  })
})

describe('a toast with an action', () => {
  const LONG = 'signup changed on disk since you opened it. '.repeat(3)

  function raise(options: Parameters<typeof toast.add>[0]) {
    render(<Toaster />)
    act(() => {
      toast.add({ timeout: 0, ...options })
    })
  }

  it('draws the action at the right of its text in one row', async () => {
    raise({
      title: 'Deleted webapp',
      description: '3 pages, 12 frames',
      actionProps: { children: 'Undo' },
    })
    const action = box(await screen.findByRole('button', { name: 'Undo' }))
    const title = box(screen.getByText('Deleted webapp'))
    const detail = box(screen.getByText('3 pages, 12 frames'))

    expect(action.left).toBeGreaterThanOrEqual(detail.right)
    expect((action.top + action.bottom) / 2).toBeCloseTo(
      (title.top + detail.bottom) / 2,
      0,
    )
  })

  it('keeps the action clear of the close button and its ring on a one-line toast', async () => {
    raise({ title: 'Deleted webapp', actionProps: { children: 'Undo' } })
    const action = box(await screen.findByRole('button', { name: 'Undo' }))
    const close = box(screen.getByLabelText('Close'))

    expect(action.right + RING).toBeLessThanOrEqual(close.left)
  })

  it('ends the action where the reference draws it', async () => {
    raise({ title: 'Deleted webapp', actionProps: { children: 'Undo' } })

    const action = await screen.findByRole('button', { name: 'Undo' })

    expect(fromEdge(action)).toBeCloseTo(END, 1)
  })

  it('reaches the action by Tab ahead of the close button', async () => {
    raise({ title: 'Deleted webapp', actionProps: { children: 'Undo' } })
    const action = await screen.findByRole('button', { name: 'Undo' })
    action.closest<HTMLElement>('[role="dialog"]')?.focus()

    await userEvent.tab()
    expect(action).toHaveFocus()

    await userEvent.tab()
    expect(screen.getByLabelText('Close')).toHaveFocus()
  })

  it('breaks a long unbroken name before it runs under the action', async () => {
    raise({
      title: `Deleted ${'northwind'.repeat(6)}`,
      actionProps: { children: 'Undo' },
    })
    await screen.findByRole('button', { name: 'Undo' })
    const title = screen.getByText(/^Deleted northwind/)

    expect(title.scrollWidth).toBeLessThanOrEqual(title.clientWidth)
  })

  it('keeps a long description whole beside the action', async () => {
    raise({
      title: 'Nothing written',
      description: LONG,
      actionProps: { children: 'Copy text' },
    })
    const action = box(await screen.findByRole('button', { name: 'Copy text' }))
    const detail = screen.getByText(LONG.trim())
    const root = detail.closest('[role="dialog"]')

    expect(box(detail).right).toBeLessThanOrEqual(action.left)
    await waitFor(() =>
      expect(box(detail).bottom).toBeLessThanOrEqual(
        root ? box(root).bottom : 0,
      ),
    )
  })
})

describe('a toast with no action', () => {
  const NAME = 'northwind'.repeat(9)

  function raise(options: Parameters<typeof toast.add>[0]) {
    render(<Toaster />)
    act(() => {
      toast.add({ timeout: 0, ...options })
    })
  }

  it('keeps its text clear of the close button and its ring', async () => {
    raise({
      title: 'Nothing written',
      description: 'signup changed on disk since you opened it. '.repeat(3),
    })
    const title = box(await screen.findByText('Nothing written'))
    const detail = box(screen.getByText(/^signup changed/))
    const close = box(screen.getByLabelText('Close'))

    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull()
    expect(title.right + RING).toBeLessThanOrEqual(close.left)
    expect(detail.right + RING).toBeLessThanOrEqual(close.left)
  })

  it('ends its text where an action ends', async () => {
    raise({ title: 'Nothing written' })

    const title = await screen.findByText('Nothing written')

    expect(fromEdge(title)).toBeCloseTo(END, 1)
  })

  it('breaks a long unbroken title before it runs under the close button', async () => {
    raise({ title: `Exported ${NAME}` })
    const title = await screen.findByText(/^Exported northwind/)

    expect(title.scrollWidth).toBeLessThanOrEqual(title.clientWidth)
  })

  it('holds a long unbroken description inside its box', async () => {
    raise({ title: "Couldn't export hero", description: NAME })
    const detail = await screen.findByText(NAME)
    const root = detail.closest('[role="dialog"]')

    expect(detail.scrollWidth).toBeLessThanOrEqual(detail.clientWidth)
    await waitFor(() =>
      expect(box(detail).bottom).toBeLessThanOrEqual(
        root ? box(root).bottom : 0,
      ),
    )
  })

  it('stays clear once an update drops its action', async () => {
    render(<Toaster />)
    let id = ''
    act(() => {
      id = toast.add({
        title: 'This edit link has expired',
        timeout: 0,
        actionProps: { children: 'Edit this board' },
      })
    })
    await screen.findByRole('button', { name: 'Edit this board' })

    act(() => toast.update(id, { actionProps: undefined }))

    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Edit this board' }),
      ).toBeNull(),
    )
    const title = box(screen.getByText('This edit link has expired'))
    const close = box(screen.getByLabelText('Close'))
    expect(title.right + RING).toBeLessThanOrEqual(close.left)
  })
})
