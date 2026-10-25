import '../../styles.css'

import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'

import { setCharacterKeys } from '@/client/actions/character-keys'
import {
  type Action,
  refreshActions,
  registerActions,
} from '@/client/actions/registry'
import { TooltipProvider } from '@/client/components/ui/tooltip'
import { liveStore } from '@/client/live/store'

import { modeStore } from '../mode'
import { shapeStore, usePlaceTools } from '../place/tool'
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

  it('places Text and the Shape tool after Frame, ahead of Note', () => {
    renderToolbar()

    expect(
      screen
        .getAllByRole('button')
        .slice(0, 7)
        .map((button) => button.getAttribute('aria-label')),
    ).toEqual(['Move', 'Hand', 'Frame', 'Text', 'Rectangle', 'Shapes', 'Note'])
  })

  describe('the Shape tool', () => {
    function PlaceTools() {
      usePlaceTools()
      return null
    }

    function renderWithTools() {
      liveStore.setState({ canWrite: true })
      return render(
        <TooltipProvider>
          <PlaceTools />
          <Toolbar />
        </TooltipProvider>,
      )
    }

    afterEach(() => {
      shapeStore.setState({ shape: 'rectangle' })
      modeStore.setState({ tool: 'move', mode: 'edit' })
      liveStore.setState({ canWrite: false })
    })

    it('places the last shape chosen from its menu and shows it pressed', async () => {
      renderWithTools()

      await userEvent.click(screen.getByRole('button', { name: 'Shapes' }))
      await userEvent.click(
        await screen.findByRole('menuitemradio', { name: /Ellipse/ }),
      )

      expect(modeStore.getState().tool).toBe('shape')
      expect(screen.getByRole('button', { name: 'Ellipse' })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
    })

    it("marks the shape chosen in its menu and names each shape's key", async () => {
      renderWithTools()

      await userEvent.click(screen.getByRole('button', { name: 'Shapes' }))

      const rows = await screen.findAllByRole('menuitemradio')
      expect(rows.map((row) => row.textContent)).toEqual([
        'RectangleR',
        'EllipseO',
        'DividerL',
      ])
      expect(rows[0]).toHaveAttribute('aria-checked', 'true')
    })

    it('gives the shapes caret a target of at least 24 by 24px clear of its neighbors', () => {
      renderWithTools()

      const caret = screen.getByRole('button', { name: 'Shapes' })
      const box = caret.getBoundingClientRect()
      const shape = screen
        .getByRole('button', { name: 'Rectangle' })
        .getBoundingClientRect()
      const note = screen
        .getByRole('button', { name: 'Note' })
        .getBoundingClientRect()

      expect(box.width).toBeGreaterThanOrEqual(24)
      expect(box.height).toBeGreaterThanOrEqual(24)
      expect(box.left).toBeGreaterThanOrEqual(shape.right)
      expect(box.right).toBeLessThanOrEqual(note.left)
    })

    it('shows the Shape button unpressed under another tool', () => {
      renderWithTools()

      expect(screen.getByRole('button', { name: 'Rectangle' })).toHaveAttribute(
        'aria-pressed',
        'false',
      )
    })
  })

  it("names a tool's key on hover while single-key shortcuts are on", async () => {
    register({
      id: 'tool.hand',
      label: 'Hand',
      group: 'tool',
      keys: ['h'],
      run: () => {},
    })
    renderToolbar()

    await userEvent.hover(screen.getByRole('button', { name: 'Hand' }))

    expect(await screen.findByText('Hand H')).toBeInTheDocument()
  })

  it("drops a tool's key on hover while single-key shortcuts are off", async () => {
    setCharacterKeys(false)
    cleanups.push(() => setCharacterKeys(true))
    register({
      id: 'tool.hand',
      label: 'Hand',
      group: 'tool',
      keys: ['h'],
      run: () => {},
    })
    renderToolbar()

    await userEvent.hover(screen.getByRole('button', { name: 'Hand' }))

    expect(await screen.findByText('Hand')).toBeInTheDocument()
    expect(screen.queryByText('Hand H')).toBeNull()
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
