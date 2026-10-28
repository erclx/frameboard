import '../../styles.css'

import { act, cleanup, render, screen, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { IS_MAC } from '@/client/actions/keys'
import { liveStore, receiveBoard } from '@/client/live/store'
import { receiveChanges, unseenStore } from '@/client/live/unseen'
import { frameTheme, themeStore } from '@/client/theme/store'
import type { PageRecord } from '@/shared/records/list'
import { boardOf, frameOf, pageOf } from '@/test/board'
import { contrastOnPage } from '@/test/contrast'

import { useBoardActions } from '../board-actions'
import { Canvas } from '../canvas'
import { useCompareActions } from '../changes/compare'
import { modeStore } from '../mode'
import { notesUi, useNoteTool } from '../notes/tool'
import { useSectionActions } from '../sections/actions'
import { clear, select, selectElement, selectionStore } from '../selection'
import { clipboardStore, useStructureActions } from '../structure/actions'
import { useFrameTool } from '../structure/tool'

const MOD = IS_MAC ? '⌘' : 'Ctrl'

const A = frameOf('a', { box: { x: 0, y: 0, width: 300, height: 300 } })
const B = frameOf('b', { box: { x: 400, y: 0, width: 300, height: 300 } })
const C = frameOf('c', {
  box: { x: 800, y: 0, width: 300, height: 300 },
  locked: true,
})
const PAGE = pageOf([A, B, C])

/** The board's registered actions around one canvas, as the board screen mounts them. */
function Board({ page }: { page: PageRecord }) {
  useBoardActions()
  useStructureActions(page.ref, page.frames)
  useSectionActions(page.ref, page.frames, page.sections)
  useFrameTool()
  useNoteTool()
  useCompareActions()
  return (
    <div style={{ width: 1200, height: 700 }}>
      <Canvas page={page} reloads={{}} />
    </div>
  )
}

function hitLayer(): HTMLElement {
  const hit = document.querySelector<HTMLElement>('[data-hit-layer]')
  if (!hit) throw new Error('no hit layer')
  return hit
}

/** The center of a frame on screen, read from where the canvas drew it. */
function centerOf(ref: string): { x: number; y: number } {
  const drawn = document.querySelector(`[data-frame="${CSS.escape(ref)}"]`)
  if (!drawn) throw new Error(`no frame ${ref}`)
  const box = drawn.getBoundingClientRect()
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 }
}

function rightClick(at: { x: number; y: number }, init: MouseEventInit = {}) {
  act(() => {
    hitLayer().dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        button: 2,
        clientX: at.x,
        clientY: at.y,
        ...init,
      }),
    )
  })
}

/** A point on the canvas past every frame, inside the fit padding. */
function emptyPoint(): { x: number; y: number } {
  const box = hitLayer().getBoundingClientRect()
  return { x: box.left + 10, y: box.bottom - 10 }
}

describe('CanvasMenu', () => {
  beforeEach(() => {
    receiveBoard(liveStore, boardOf(PAGE))
    liveStore.setState({ canWrite: true })
  })

  afterEach(() => {
    cleanup()
    clear(selectionStore)
    clipboardStore.setState({ held: 0 })
    themeStore.setState({ choice: 'light', flipped: new Set() })
    modeStore.setState({ mode: 'edit', tool: 'move', hideUi: false })
    notesUi.setState({ open: null, drafts: {} })
  })

  it('selects an unselected frame alone on opening, never the two selected before', async () => {
    render(<Board page={PAGE} />)
    select(selectionStore, PAGE.ref, [A.ref, C.ref])

    rightClick(centerOf(B.ref))

    await screen.findByRole('menu')
    expect(selectionStore.getState().frames).toEqual([B.ref])
  })

  it('keeps a selection holding the right-clicked frame', async () => {
    render(<Board page={PAGE} />)
    select(selectionStore, PAGE.ref, [A.ref, B.ref])

    rightClick(centerOf(B.ref))

    await screen.findByRole('menu')
    expect(selectionStore.getState().frames).toEqual([A.ref, B.ref])
  })

  it('heads the menu of one frame with Frame', async () => {
    render(<Board page={PAGE} />)

    rightClick(centerOf(A.ref))

    const menu = await screen.findByRole('menu')
    expect(within(menu).getAllByRole('group')[0]).toHaveAccessibleName('Frame')
  })

  describe.each(['light', 'dark'])('in the %s theme', (theme) => {
    beforeEach(() => {
      document.documentElement.classList.toggle('dark', theme === 'dark')
    })

    afterEach(() => {
      document.documentElement.classList.remove('dark')
    })

    it('reads the menu label at 4.5:1 or better once the menu settles', async () => {
      render(<Board page={PAGE} />)

      rightClick(centerOf(A.ref))
      const menu = await screen.findByRole('menu')
      await Promise.all(
        menu.getAnimations({ subtree: true }).map((each) => each.finished),
      )

      expect(
        contrastOnPage(within(menu).getByText('Frame')),
      ).toBeGreaterThanOrEqual(4.5)
    })
  })

  it('heads the menu of a selection of two with 2 frames', async () => {
    render(<Board page={PAGE} />)
    select(selectionStore, PAGE.ref, [A.ref, B.ref])

    rightClick(centerOf(B.ref))

    const menu = await screen.findByRole('menu')
    expect(within(menu).getAllByRole('group')[0]).toHaveAccessibleName(
      '2 frames',
    )
  })

  it("lists the frame's items with their keys as chips", async () => {
    render(<Board page={PAGE} />)

    rightClick(centerOf(A.ref))

    const menu = await screen.findByRole('menu')
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual([
      `Copy${MOD}C`,
      `Cut${MOD}X`,
      IS_MAC ? 'Copy as PNG⇧⌘C' : 'Copy as PNGCtrlShiftC',
      `Duplicate${MOD}D`,
      IS_MAC ? 'Wrap in section⌥⌘G' : 'Wrap in sectionCtrlAltG',
      'RenameF2',
      'Fit height',
      'Compare with before',
      'Add a noteN',
      IS_MAC ? 'Hide⇧⌘H' : 'HideCtrlShiftH',
      IS_MAC ? 'Lock⇧⌘L' : 'LockCtrlShiftL',
      'Flip to dark',
      'Delete⌫',
    ])
  })

  it('opens a note on the right-clicked frame from Add a note', async () => {
    render(<Board page={PAGE} />)
    rightClick(centerOf(A.ref))
    const menu = await screen.findByRole('menu')

    await userEvent.click(
      within(menu).getByRole('menuitem', { name: /^Add a note/ }),
    )

    expect([
      modeStore.getState().tool,
      notesUi.getState().open?.kind === 'new' ? notesUi.getState().open : null,
    ]).toMatchObject([
      'note',
      { pick: { frame: { ref: A.ref }, element: null } },
    ])
  })

  it('greys Cut on a locked frame and keeps Copy, as their keys do', async () => {
    render(<Board page={PAGE} />)
    rightClick(centerOf(C.ref))
    const menu = await screen.findByRole('menu')

    expect([
      within(menu)
        .getByRole('menuitem', { name: 'Copy' })
        .getAttribute('aria-disabled'),
      within(menu)
        .getByRole('menuitem', { name: /^Cut/ })
        .getAttribute('aria-disabled'),
    ]).toEqual([null, 'true'])
  })

  it('flips the right-clicked frame alone, writing nothing', async () => {
    render(<Board page={PAGE} />)
    rightClick(centerOf(A.ref))
    const menu = await screen.findByRole('menu')

    await userEvent.click(
      within(menu).getByRole('menuitem', { name: 'Flip to dark' }),
    )

    expect([frameTheme(A.ref), frameTheme(B.ref)]).toEqual(['dark', 'light'])
  })

  it('names the theme to flip back to once the frame is flipped', async () => {
    render(<Board page={PAGE} />)
    rightClick(centerOf(A.ref))
    await userEvent.click(
      within(await screen.findByRole('menu')).getByRole('menuitem', {
        name: 'Flip to dark',
      }),
    )

    await expect.poll(() => screen.queryByRole('menu')).toBeNull()

    rightClick(centerOf(A.ref))

    expect(
      within(await screen.findByRole('menu')).getByRole('menuitem', {
        name: 'Flip to light',
      }),
    ).toBeInTheDocument()
  })

  it('offers Fit height on an unlocked frame and greys it on a locked one', async () => {
    render(<Board page={PAGE} />)
    rightClick(centerOf(A.ref))
    const open = within(await screen.findByRole('menu')).getByRole('menuitem', {
      name: 'Fit height',
    })
    expect(open).not.toHaveAttribute('aria-disabled', 'true')
    await userEvent.keyboard('{Escape}')
    await expect.poll(() => screen.queryByRole('menu')).toBeNull()

    rightClick(centerOf(C.ref))

    expect(
      within(await screen.findByRole('menu')).getByRole('menuitem', {
        name: 'Fit height',
      }),
    ).toHaveAttribute('aria-disabled', 'true')
  })

  it('offers Compare with before on a frame an agent changed and greys it on another', async () => {
    act(() =>
      receiveChanges(unseenStore, [
        {
          id: 'c1',
          frame: A.ref,
          at: '2026-10-25T12:00:00.000Z',
          hash: 'c'.repeat(64),
          author: null,
          elements: [1],
          removed: 0,
          whole: false,
          created: false,
          before: 'b'.repeat(64),
        },
      ]),
    )
    render(<Board page={PAGE} />)
    rightClick(centerOf(A.ref))
    const offered = within(await screen.findByRole('menu')).getByRole(
      'menuitem',
      { name: 'Compare with before' },
    )
    expect(offered).not.toHaveAttribute('aria-disabled', 'true')
    await userEvent.keyboard('{Escape}')
    await expect.poll(() => screen.queryByRole('menu')).toBeNull()
    act(() => unseenStore.setState({ unseen: {}, base: {} }))

    rightClick(centerOf(B.ref))

    expect(
      within(await screen.findByRole('menu')).getByRole('menuitem', {
        name: 'Compare with before',
      }),
    ).toHaveAttribute('aria-disabled', 'true')
  })

  it('greys Delete on a locked frame, as its key is', async () => {
    render(<Board page={PAGE} />)

    rightClick(centerOf(C.ref))

    const menu = await screen.findByRole('menu')
    expect(
      within(menu).getByRole('menuitem', { name: /Delete/ }),
    ).toHaveAttribute('aria-disabled', 'true')
  })

  it('opens the empty canvas menu with Paste here greyed while nothing is held', async () => {
    render(<Board page={PAGE} />)

    rightClick(emptyPoint())

    const menu = await screen.findByRole('menu')
    expect(
      within(menu).getByRole('menuitem', { name: /Paste here/ }),
    ).toHaveAttribute('aria-disabled', 'true')
  })

  it('lists the empty canvas items with the keys they stand in for', async () => {
    render(<Board page={PAGE} />)
    clipboardStore.setState({ held: 1 })

    rightClick(emptyPoint())

    const menu = await screen.findByRole('menu')
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual([
      `Paste here${MOD}V`,
      'New frame hereF',
      `Select all${MOD}A`,
      IS_MAC ? 'Zoom to fit⇧1' : 'Zoom to fitShift1',
      `Hide UI${MOD}\\`,
    ])
  })

  it('leaves the selection as it was on empty canvas', async () => {
    render(<Board page={PAGE} />)
    select(selectionStore, PAGE.ref, [A.ref])

    rightClick(emptyPoint())

    await screen.findByRole('menu')
    expect(selectionStore.getState().frames).toEqual([A.ref])
  })

  it('opens no menu on a Ctrl-press of the primary button, which the drag keeps', () => {
    render(<Board page={PAGE} />)

    rightClick(centerOf(A.ref), { button: 0, ctrlKey: true })

    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('opens the element menu inside the selected element', async () => {
    render(<Board page={PAGE} />)
    selectElement(selectionStore, PAGE.ref, {
      frame: A.ref,
      index: 2,
      hash: 'h',
    })
    // The overlay draws the selected element's outline once the frame's
    // page loads, which no board serves here, so the test draws it.
    const outline = document.createElement('div')
    outline.dataset.elementSelection = ''
    Object.assign(outline.style, {
      position: 'absolute',
      left: '100px',
      top: '100px',
      width: '100px',
      height: '100px',
    })
    document.querySelector('[data-layer]')?.append(outline)

    rightClick(centerOf(A.ref))

    const menu = await screen.findByRole('menu')
    expect([
      within(menu).getByText('Element'),
      selectionStore.getState().element?.index,
    ]).toEqual([expect.anything(), 2])
  })

  it('ends the element menu with Delete', async () => {
    render(<Board page={PAGE} />)
    selectElement(selectionStore, PAGE.ref, {
      frame: A.ref,
      index: 2,
      hash: 'h',
    })
    const outline = document.createElement('div')
    outline.dataset.elementSelection = ''
    Object.assign(outline.style, {
      position: 'absolute',
      left: '100px',
      top: '100px',
      width: '100px',
      height: '100px',
    })
    document.querySelector('[data-layer]')?.append(outline)

    rightClick(centerOf(A.ref))

    const menu = await screen.findByRole('menu')
    expect(within(menu).getAllByRole('menuitem').at(-1)).toHaveTextContent(
      /^Delete/,
    )
  })

  it('selects the frame when the right-click lands in it outside the selected element', async () => {
    render(<Board page={PAGE} />)
    selectElement(selectionStore, PAGE.ref, {
      frame: B.ref,
      index: 2,
      hash: 'h',
    })

    rightClick(centerOf(B.ref))

    await screen.findByRole('menu')
    expect(selectionStore.getState()).toMatchObject({
      frames: [B.ref],
      element: null,
    })
  })

  it('closes on Esc and keeps the selection', async () => {
    render(<Board page={PAGE} />)
    rightClick(centerOf(A.ref))
    await screen.findByRole('menu')

    await userEvent.keyboard('{Escape}')

    await expect.poll(() => screen.queryByRole('menu')).toBeNull()
    expect(selectionStore.getState().frames).toEqual([A.ref])
  })
})
