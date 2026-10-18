import '../../styles.css'

import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'

import {
  type Action,
  refreshActions,
  registerActions,
} from '@/client/actions/registry'
import { TooltipProvider } from '@/client/components/ui/tooltip'

import { Toolbar } from './toolbar'

const cleanups: (() => void)[] = []

function register(...actions: Action[]): void {
  cleanups.push(registerActions(actions))
}

function renderToolbar() {
  return render(
    <TooltipProvider>
      <Toolbar />
    </TooltipProvider>,
  )
}

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.()
})

describe('Toolbar', () => {
  it("runs a tool's action and shows the active tool pressed", async () => {
    let tool = 'move'
    register(
      {
        id: 'tool.move',
        label: 'Move',
        group: 'tool',
        keys: ['v'],
        run: () => (tool = 'move'),
        checked: () => tool === 'move',
      },
      {
        id: 'tool.hand',
        label: 'Hand',
        group: 'tool',
        keys: ['h'],
        run: () => {
          tool = 'hand'
          refreshActions()
        },
        checked: () => tool === 'hand',
      },
    )
    renderToolbar()

    await userEvent.click(screen.getByRole('button', { name: 'Hand' }))

    expect(screen.getByRole('button', { name: 'Hand' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('runs the mode an Edit or Play press names', async () => {
    let mode = 'edit'
    register({
      id: 'mode.play',
      label: 'Play',
      group: 'mode',
      run: () => (mode = 'play'),
    })
    renderToolbar()

    await userEvent.click(screen.getByRole('button', { name: 'Play' }))

    expect(mode).toBe('play')
  })

  it('shows an unregistered tool disabled, naming it and its key on hover', async () => {
    renderToolbar()
    const frame = screen.getByRole('button', { name: 'Frame' })

    await userEvent.hover(frame)

    expect(frame).toHaveAttribute('aria-disabled', 'true')
    expect(await screen.findByText('Frame F')).toBeInTheDocument()
  })

  it('turns a button enabled when its action registers after it mounted', () => {
    renderToolbar()

    act(() =>
      register({
        id: 'edit.undo',
        label: 'Undo',
        group: 'edit',
        run: () => {},
      }),
    )

    expect(screen.getByRole('button', { name: 'Undo' })).not.toHaveAttribute(
      'aria-disabled',
    )
  })
})
