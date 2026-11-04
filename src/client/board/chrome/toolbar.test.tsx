import '../../styles.css'

import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { setCharacterKeys } from '@/client/actions/character-keys'
import { keyLabel } from '@/client/actions/keys'
import {
  type Action,
  refreshActions,
  registerActions,
} from '@/client/actions/registry'
import { Toaster } from '@/client/components/ui/toast'
import { TooltipProvider } from '@/client/components/ui/tooltip'
import { liveStore } from '@/client/live/store'
import { contrastOnPage } from '@/test/contrast'
import { contrastHovered } from '@/test/hover-contrast'

import { modeStore } from '../mode'
import {
  pickerStore,
  placementStore,
  shapeStore,
  usePlaceTools,
} from '../place/tool'
import { boxToolStore } from '../sections/actions'
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

describe('the toast stack beside the toolbar', () => {
  function Screen({ toolbar }: { toolbar: boolean }) {
    return (
      <TooltipProvider>
        <Toaster />
        {toolbar ? <Toolbar /> : null}
      </TooltipProvider>
    )
  }

  const stackBottom = () =>
    getComputedStyle(screen.getByRole('region', { name: /notifications/i }))
      .bottom

  it('sits above the bar by its height, its 16px offset, and an 8px gap', () => {
    render(<Screen toolbar />)

    const bar = screen.getByRole('toolbar', { name: 'Tools' })

    expect(stackBottom()).toBe(`${bar.offsetHeight + 24}px`)
  })

  it('follows the bar when its height changes', async () => {
    render(<Screen toolbar />)
    const bar = screen.getByRole('toolbar', { name: 'Tools' })

    bar.style.height = '90px'

    await vi.waitFor(() => expect(stackBottom()).toBe('114px'))
  })

  it('returns to the corner when the bar unmounts', () => {
    const { rerender } = render(<Screen toolbar />)

    rerender(<Screen toolbar={false} />)

    expect(stackBottom()).toBe('16px')
  })
})

describe.each(['light', 'dark'])('the blue fills in the %s theme', (theme) => {
  const pressedTool = (id: string, label: string, group: 'tool' | 'mode') =>
    register({
      id,
      label,
      group,
      palette: false,
      run: () => {},
      checked: () => true,
    })

  beforeEach(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  })

  afterEach(() => {
    document.documentElement.classList.remove('dark')
  })

  it('reads the active tool at 4.5:1 or better at rest and hovered', async () => {
    pressedTool('tool.note', 'Note', 'tool')
    renderToolbar()
    const tool = screen.getByRole('button', { name: 'Note' })

    expect(tool).toHaveAttribute('aria-pressed', 'true')
    expect(contrastOnPage(tool)).toBeGreaterThanOrEqual(4.5)
    expect(await contrastHovered(tool)).toBeGreaterThanOrEqual(4.5)
  })

  it('reads the Play pill at 4.5:1 or better at rest and hovered', async () => {
    pressedTool('mode.play', 'Play', 'mode')
    renderToolbar()
    const pill = screen.getByRole('button', { name: 'Play' })

    expect(pill).toHaveAttribute('aria-pressed', 'true')
    expect(contrastOnPage(pill)).toBeGreaterThanOrEqual(4.5)
    expect(await contrastHovered(pill)).toBeGreaterThanOrEqual(4.5)
  })

  it('reads the checked pointer menu row at 4.5:1 or better, focused too', async () => {
    pressedTool('tool.move', 'Move', 'tool')
    renderToolbar()

    await userEvent.click(screen.getByRole('button', { name: 'Pointer tools' }))
    const row = await screen.findByRole('menuitemradio', {
      name: /Move/,
      checked: true,
    })
    row.blur()

    expect(contrastOnPage(row)).toBeGreaterThanOrEqual(4.5)

    row.focus()

    expect(row).toHaveFocus()
    expect(contrastOnPage(row)).toBeGreaterThanOrEqual(4.5)
  })
})

describe('Toolbar', () => {
  it("runs a tool's action and shows the active tool pressed", async () => {
    let tool = 'move'
    register(
      {
        id: 'tool.move',
        label: 'Move',
        group: 'tool',
        palette: false,
        keys: ['v'],
        run: () => (tool = 'move'),
        checked: () => tool === 'move',
      },
      {
        id: 'tool.hand',
        label: 'Hand',
        group: 'tool',
        palette: false,
        keys: ['h'],
        run: () => {
          tool = 'hand'
          refreshActions()
        },
        checked: () => tool === 'hand',
      },
    )
    renderToolbar()

    await userEvent.click(screen.getByRole('button', { name: 'Pointer tools' }))
    await userEvent.click(
      await screen.findByRole('menuitemradio', { name: /Hand/ }),
    )

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
      palette: false,
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
        .slice(0, 8)
        .map((button) => button.getAttribute('aria-label')),
    ).toEqual([
      'Move',
      'Pointer tools',
      'Frame',
      'Frame tools',
      'Text',
      'Rectangle',
      'Shapes',
      'Note',
    ])
  })

  describe('the Move slot', () => {
    function renderWithPointerTools() {
      const tool = (
        id: string,
        name: 'move' | 'hand',
        key: string,
      ): Action => ({
        id,
        label: name === 'move' ? 'Move' : 'Hand',
        group: 'tool',
        palette: false,
        keys: [key],
        run: () => {
          modeStore.setState({ tool: name })
          refreshActions()
        },
        checked: () => modeStore.getState().tool === name,
      })
      register(tool('tool.move', 'move', 'v'), tool('tool.hand', 'hand', 'h'))
      return renderToolbar()
    }

    afterEach(() => {
      modeStore.setState({ tool: 'move', mode: 'edit' })
    })

    it('lists Move and Hand in its menu, keeping V and H', async () => {
      renderWithPointerTools()

      await userEvent.click(
        screen.getByRole('button', { name: 'Pointer tools' }),
      )

      const rows = await screen.findAllByRole('menuitemradio')
      expect(rows.map((row) => row.textContent)).toEqual(['MoveV', 'HandH'])
    })

    it('shows Hand in the slot while H holds it on, and Move again after V', () => {
      renderWithPointerTools()

      act(() => {
        modeStore.setState({ tool: 'hand' })
        refreshActions()
      })
      expect(screen.getByRole('button', { name: 'Hand' })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      act(() => {
        modeStore.setState({ tool: 'move' })
        refreshActions()
      })

      expect(screen.getByRole('button', { name: 'Move' })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
    })
  })

  describe('the Place toggle', () => {
    afterEach(() => {
      placementStore.setState({ placing: 'auto' })
    })

    it('starts on Auto', () => {
      renderToolbar()

      const toggle = screen.getByRole('group', { name: 'Place new elements' })
      expect(
        within(toggle)
          .getAllByRole('button')
          .map((button) => [
            button.textContent,
            button.getAttribute('aria-pressed'),
          ]),
      ).toEqual([
        ['Auto', 'true'],
        ['Flow', 'false'],
        ['Free', 'false'],
      ])
    })

    it.each([
      ['Flow', 'flow'],
      ['Free', 'free'],
      ['Auto', 'auto'],
    ] as const)('sets %s on a press', async (label, placing) => {
      placementStore.setState({ placing: label === 'Auto' ? 'free' : 'auto' })
      renderToolbar()

      await userEvent.click(screen.getByRole('button', { name: label }))

      expect(placementStore.getState().placing).toBe(placing)
      expect(screen.getByRole('button', { name: label })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
    })

    it('holds one tab stop on the choice on, and moves along it by arrow', async () => {
      placementStore.setState({ placing: 'flow' })
      renderToolbar()
      const flow = screen.getByRole('button', { name: 'Flow' })

      expect(
        within(screen.getByRole('group', { name: 'Place new elements' }))
          .getAllByRole('button')
          .map((button) => button.tabIndex),
      ).toEqual([-1, 0, -1])
      act(() => flow.focus())
      await userEvent.keyboard('{ArrowRight}')

      expect(screen.getByRole('button', { name: 'Free' })).toHaveFocus()
      expect(placementStore.getState().placing).toBe('flow')
    })
  })

  describe('the Frame slot', () => {
    function renderWithBoxTools() {
      const tool = (
        id: string,
        name: 'frame' | 'section',
        keys: string[],
      ): Action => ({
        id,
        label: name === 'frame' ? 'Frame' : 'Section',
        group: 'tool',
        palette: false,
        keys,
        run: () => {
          boxToolStore.setState({ tool: name })
          modeStore.setState({ tool: name, mode: 'edit' })
        },
        checked: () => modeStore.getState().tool === name,
      })
      register(
        tool('tool.frame', 'frame', ['f']),
        tool('tool.section', 'section', ['Shift+KeyS']),
      )
      return renderToolbar()
    }

    afterEach(() => {
      boxToolStore.setState({ tool: 'frame' })
      modeStore.setState({ tool: 'move', mode: 'edit' })
    })

    it("lists Frame and Section in its menu, naming each one's key", async () => {
      renderWithBoxTools()

      await userEvent.click(screen.getByRole('button', { name: 'Frame tools' }))

      const rows = await screen.findAllByRole('menuitemradio')
      expect(rows.map((row) => row.textContent)).toEqual([
        'FrameF',
        `Section${keyLabel('Shift+KeyS')}`,
      ])
    })

    it('turns Section on from its menu and shows it pressed in the slot', async () => {
      renderWithBoxTools()

      await userEvent.click(screen.getByRole('button', { name: 'Frame tools' }))
      await userEvent.click(
        await screen.findByRole('menuitemradio', { name: /Section/ }),
      )

      expect(modeStore.getState().tool).toBe('section')
      expect(screen.getByRole('button', { name: 'Section' })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
    })
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
      pickerStore.setState({ open: false })
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

    it('opens the picker from the Image or video row and keeps the last shape in the slot', async () => {
      renderWithTools()

      await userEvent.click(screen.getByRole('button', { name: 'Shapes' }))
      await userEvent.click(
        await screen.findByRole('menuitem', { name: /Image or video/ }),
      )

      expect(pickerStore.getState().open).toBe(true)
      expect(shapeStore.getState().shape).toBe('rectangle')
      expect(screen.getByRole('button', { name: 'Rectangle' })).toBeVisible()
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
      id: 'tool.text',
      label: 'Text',
      group: 'tool',
      palette: false,
      keys: ['t'],
      run: () => {},
    })
    renderToolbar()

    await userEvent.hover(screen.getByRole('button', { name: 'Text' }))

    expect(await screen.findByText('Text T')).toBeInTheDocument()
  })

  it("drops a tool's key on hover while single-key shortcuts are off", async () => {
    setCharacterKeys(false)
    cleanups.push(() => setCharacterKeys(true))
    register({
      id: 'tool.text',
      label: 'Text',
      group: 'tool',
      palette: false,
      keys: ['t'],
      run: () => {},
    })
    renderToolbar()

    await userEvent.hover(screen.getByRole('button', { name: 'Text' }))

    expect(await screen.findByText('Text')).toBeInTheDocument()
    expect(screen.queryByText('Text T')).toBeNull()
  })

  it.each(['Edit', 'Play'])(
    'names the Edit and Play toggle key on hovering %s',
    async (label) => {
      register(
        {
          id: `mode.${label.toLowerCase()}`,
          label,
          group: 'mode',
          palette: false,
          run: () => {},
        },
        {
          id: 'mode.toggle',
          label: 'Edit or Play',
          group: 'mode',
          palette: false,
          keys: ['p'],
          run: () => {},
        },
      )
      renderToolbar()

      await userEvent.hover(screen.getByRole('button', { name: label }))

      expect(await screen.findByText(`${label} P`)).toBeInTheDocument()
    },
  )

  it('turns a button enabled when its action registers after it mounted', () => {
    renderToolbar()

    act(() =>
      register({
        id: 'edit.undo',
        label: 'Undo',
        group: 'edit',
        palette: false,
        run: () => {},
      }),
    )

    expect(screen.getByRole('button', { name: 'Undo' })).not.toHaveAttribute(
      'aria-disabled',
    )
  })
})
