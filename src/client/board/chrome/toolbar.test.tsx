import '../../styles.css'

import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { setCharacterKeys } from '@/client/actions/character-keys'
import { keyLabel } from '@/client/actions/keys'
import {
  type Action,
  bindKeys,
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
import { stageForRoom } from './toolbar-stage'

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

  it('reads the icon-only Play pill at 4.5:1 or better', () => {
    pressedTool('mode.play', 'Play', 'mode')
    render(
      <TooltipProvider>
        <div style={{ position: 'relative', width: 334 }}>
          <Toolbar />
        </div>
      </TooltipProvider>,
    )
    const pill = screen.getByRole('button', { name: 'Play' })

    expect(pill).toHaveAttribute('aria-pressed', 'true')
    expect(contrastOnPage(pill)).toBeGreaterThanOrEqual(4.5)
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

  describe('the Present button', () => {
    const presentAction = (enabled: boolean): Action => ({
      id: 'present.start',
      label: 'Present page',
      group: 'present',
      palette: false,
      keys: ['Shift+KeyP'],
      enabled: () => enabled,
      run: () => {},
    })

    it('sits after the Edit and Play segment, naming its key on hover', async () => {
      register(presentAction(true))
      renderToolbar()
      const names = screen
        .getAllByRole('button')
        .map(
          (button) => button.getAttribute('aria-label') ?? button.textContent,
        )
      const present = screen.getByRole('button', { name: 'Present page' })

      await userEvent.hover(present)

      expect(names.slice(-3)).toEqual(['Edit', 'Play', 'Present page'])
      expect(
        await screen.findByText(`Present page ${keyLabel('Shift+KeyP')}`),
      ).toBeInTheDocument()
    })

    it('says why it is off while the page has no frame to show', async () => {
      register(presentAction(false))
      renderToolbar()
      const present = screen.getByRole('button', { name: 'Present page' })

      await userEvent.hover(present)

      expect(present).toHaveAttribute('aria-disabled', 'true')
      expect(
        await screen.findByText(
          'Nothing to present, every frame here is hidden',
        ),
      ).toBeInTheDocument()
    })
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

    it('opens the picker from the Image, video, or audio row and keeps the last shape in the slot', async () => {
      renderWithTools()

      await userEvent.click(screen.getByRole('button', { name: 'Shapes' }))
      await userEvent.click(
        await screen.findByRole('menuitem', { name: /Image, video, or audio/ }),
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

describe('the stage a room picks', () => {
  it.each([
    [754, 'full'],
    [753, 'folded'],
    [560, 'folded'],
    [559, 'tools'],
    [357, 'tools'],
    [356, 'active'],
    [221, 'active'],
    [220, 'more'],
    [44, 'more'],
  ] as const)('at %i reads %s', (room, stage) => {
    expect(stageForRoom(room)).toBe(stage)
  })
})

describe('the toolbar in a narrow column', () => {
  /**
   * The column is the bar's parent, whose width less the bar's 24px margin is
   * the room. It takes the 12px the board screen sets, which the widths assume.
   */
  function renderInRoom(room: number) {
    const { container } = render(
      <TooltipProvider>
        <div
          className="text-body"
          style={{ position: 'relative', width: room + 24, height: 200 }}
        >
          <Toolbar />
        </div>
      </TooltipProvider>,
    )
    const column = container.firstElementChild
    if (!(column instanceof HTMLElement)) throw new Error('No column rendered')
    return column
  }

  const bar = () => screen.getByRole('toolbar', { name: 'Tools' })

  const barNames = () =>
    within(bar())
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label') ?? button.textContent)

  const openMore = async () => {
    await userEvent.click(screen.getByRole('button', { name: 'More tools' }))
    return screen.findByRole('menu')
  }

  /** Each row's name, without the key chip beside it. */
  const rowNames = (menu: HTMLElement) =>
    [...menu.querySelectorAll('[role^="menuitem"]')].map((row) =>
      row.textContent.slice(
        0,
        row.textContent.length -
          (row.querySelector('kbd')?.textContent.length ?? 0),
      ),
    )

  const action = (id: string, extra: Partial<Action> = {}): Action =>
    ({
      id,
      label: id,
      group: 'tool',
      palette: false,
      run: () => {},
      ...extra,
    }) as Action

  afterEach(() => {
    placementStore.setState({ placing: 'auto' })
    pickerStore.setState({ open: false })
    modeStore.setState({ tool: 'move', mode: 'edit' })
    liveStore.setState({ canWrite: false })
  })

  it.each([
    [
      754,
      [
        'Move',
        'Pointer tools',
        'Frame',
        'Frame tools',
        'Text',
        'Rectangle',
        'Shapes',
        'Note',
        'Auto',
        'Flow',
        'Free',
        'Undo',
        'Redo',
        'Zoom to fit',
        'Theme',
        'Edit',
        'Play',
        'Present page',
      ],
    ],
    [
      560,
      [
        'Move',
        'Pointer tools',
        'Frame',
        'Frame tools',
        'Text',
        'Rectangle',
        'Shapes',
        'Note',
        'Place new elements, Auto',
        'More tools',
        'Edit',
        'Play',
        'Present page',
      ],
    ],
    [
      357,
      [
        'Move',
        'Frame',
        'Text',
        'Rectangle',
        'Note',
        'More tools',
        'Edit',
        'Play',
        'Present page',
      ],
    ],
    [221, ['Move', 'More tools', 'Edit', 'Play', 'Present page']],
    [220, ['More tools']],
  ])('shows the controls room %i holds', (room, names) => {
    renderInRoom(room)

    expect(barNames()).toEqual(names)
  })

  const FOUR = ['Undo', 'Redo', 'Zoom to fit', 'Theme']
  const PLACE = ['Auto', 'Flow', 'Free']
  const SHAPE_ROWS = [
    'Rectangle',
    'Ellipse',
    'Divider',
    'Image, video, or audio…',
  ]

  it.each([
    [560, FOUR],
    [357, ['Hand', 'Section', ...SHAPE_ROWS, ...PLACE, ...FOUR]],
    [
      221,
      [
        'Move',
        'Hand',
        'Frame',
        'Section',
        'Text',
        ...SHAPE_ROWS,
        'Note',
        ...PLACE,
        ...FOUR,
      ],
    ],
    [
      220,
      [
        'Edit',
        'Play',
        'Present page',
        'Move',
        'Hand',
        'Frame',
        'Section',
        'Text',
        ...SHAPE_ROWS,
        'Note',
        ...PLACE,
        ...FOUR,
      ],
    ],
  ])('lists in More what room %i folds away', async (room, names) => {
    renderInRoom(room)

    expect(rowNames(await openMore())).toEqual(names)
  })

  it('draws no More while every control fits', () => {
    renderInRoom(754)

    expect(screen.queryByRole('button', { name: 'More tools' })).toBeNull()
  })

  it.each([754, 560, 357, 221, 44])(
    'clips nothing at the narrowest room %i',
    (room) => {
      renderInRoom(room)

      expect(bar().scrollWidth).toBeLessThanOrEqual(bar().clientWidth)
      expect(bar().offsetWidth).toBeLessThanOrEqual(room)
    },
  )

  it('changes stage when the column narrows, closing an open More', async () => {
    const column = renderInRoom(560)
    await openMore()

    column.style.width = `${357 + 24}px`

    await vi.waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    expect(screen.queryByRole('button', { name: 'Pointer tools' })).toBeNull()
  })

  it('runs a tool by its key with its button folded away', async () => {
    let runs = 0
    register(
      action('tool.text', {
        label: 'Text',
        keys: ['t'],
        run: () => (runs += 1),
      }),
    )
    cleanups.push(bindKeys(window))
    renderInRoom(44)

    await userEvent.keyboard('t')

    expect(runs).toBe(1)
  })

  it('runs the action the bar button runs from its More row', async () => {
    let runs = 0
    register(action('edit.undo', { label: 'Undo', run: () => (runs += 1) }))
    renderInRoom(560)

    await openMore()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Undo' }))

    expect(runs).toBe(1)
  })

  it('opens the picker from the Image, video, or audio row in More', async () => {
    function PlaceTools() {
      usePlaceTools()
      return null
    }
    liveStore.setState({ canWrite: true })
    render(<PlaceTools />)
    renderInRoom(357)

    await openMore()
    await userEvent.click(
      screen.getByRole('menuitem', { name: /Image, video, or audio/ }),
    )

    expect(pickerStore.getState().open).toBe(true)
  })

  it('offers Move in More while Hand fills the Move slot', async () => {
    register(
      action('tool.move', { label: 'Move', checked: () => false }),
      action('tool.hand', { label: 'Hand', checked: () => true }),
    )
    renderInRoom(357)

    expect(screen.getByRole('button', { name: 'Hand' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    const rows = rowNames(await openMore())
    expect(rows).toContain('Move')
    expect(rows).not.toContain('Hand')
  })

  it('offers Frame in More while Section fills the Frame slot', async () => {
    boxToolStore.setState({ tool: 'section' })
    cleanups.push(() => boxToolStore.setState({ tool: 'frame' }))
    renderInRoom(357)

    const rows = rowNames(await openMore())

    expect(rows).toContain('Frame')
    expect(rows).not.toContain('Section')
  })

  it('shows whichever tool is on at the single tool stage', () => {
    register(action('tool.note', { label: 'Note', checked: () => true }))
    renderInRoom(221)

    expect(screen.getByRole('button', { name: 'Note' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('marks the tool on in More', async () => {
    register(action('tool.note', { label: 'Note', checked: () => true }))
    renderInRoom(221)

    await openMore()

    expect(screen.getByRole('menuitemradio', { name: /Note/ })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  })

  it('carries a Place choice made in More to the wider folded button', async () => {
    const column = renderInRoom(357)

    await openMore()
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Free' }))
    column.style.width = `${560 + 24}px`

    expect(
      await screen.findByRole('button', { name: 'Place new elements, Free' }),
    ).toBeVisible()
    expect(placementStore.getState().placing).toBe('free')
  })

  it('marks the Place choice on in More', async () => {
    placementStore.setState({ placing: 'free' })
    renderInRoom(357)

    await openMore()

    expect(screen.getByRole('menuitemradio', { name: 'Free' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  })

  it('sets Place from the folded button', async () => {
    renderInRoom(560)

    await userEvent.click(
      screen.getByRole('button', { name: 'Place new elements, Auto' }),
    )
    await userEvent.click(
      await screen.findByRole('menuitemradio', { name: 'Flow' }),
    )

    expect(placementStore.getState().placing).toBe('flow')
  })

  it('disables a row whose action cannot run, and leaves Place usable', async () => {
    register(action('edit.undo', { label: 'Undo', enabled: () => false }))
    renderInRoom(357)

    await openMore()

    expect(screen.getByRole('menuitem', { name: 'Undo' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(
      screen.getByRole('menuitemradio', { name: 'Free' }),
    ).not.toHaveAttribute('aria-disabled', 'true')
  })

  it('reaches Edit and Play in More at the narrowest stage', async () => {
    let mode = 'edit'
    register(
      action('mode.edit', {
        label: 'Edit',
        group: 'mode',
        checked: () => mode === 'edit',
      }),
      action('mode.play', {
        label: 'Play',
        group: 'mode',
        run: () => (mode = 'play'),
        checked: () => mode === 'play',
      }),
    )
    renderInRoom(44)

    await openMore()
    expect(screen.getByRole('menuitemradio', { name: 'Edit' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await userEvent.click(screen.getByRole('menuitemradio', { name: 'Play' }))

    expect(mode).toBe('play')
  })

  it('names the Edit and Play key on the row it would switch to', async () => {
    register(
      action('mode.edit', {
        label: 'Edit',
        group: 'mode',
        checked: () => true,
      }),
      action('mode.play', {
        label: 'Play',
        group: 'mode',
        checked: () => false,
      }),
      action('mode.toggle', { label: 'Edit or Play', keys: ['p'] }),
    )
    renderInRoom(44)

    await openMore()

    expect(
      screen.getByRole('menuitemradio', { name: 'Edit' }).querySelector('kbd'),
    ).toBeNull()
    expect(
      screen.getByRole('menuitemradio', { name: /Play/ }),
    ).toHaveTextContent('PlayP')
  })

  it("drops More's single-key chips while those shortcuts are off", async () => {
    setCharacterKeys(false)
    cleanups.push(() => setCharacterKeys(true))
    register(action('tool.hand', { label: 'Hand', keys: ['h'] }))
    renderInRoom(357)

    await openMore()

    expect(
      screen.getByRole('menuitemradio', { name: 'Hand' }).querySelector('kbd'),
    ).toBeNull()
  })

  it('names the icon-only Edit and Play and marks the mode on', () => {
    register(
      action('mode.play', {
        label: 'Play',
        group: 'mode',
        checked: () => true,
      }),
    )
    renderInRoom(357)

    expect(screen.getByRole('button', { name: 'Edit' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Play' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Play' })).toHaveTextContent('')
  })
})
