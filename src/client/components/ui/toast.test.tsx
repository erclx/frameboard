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
