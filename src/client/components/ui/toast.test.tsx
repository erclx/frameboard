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
})

describe('a focused toast', () => {
  it('lets a board key run', async () => {
    let runs = 0
    const move: Action = {
      id: 'tool.move',
      label: 'Move',
      group: 'tool',
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
