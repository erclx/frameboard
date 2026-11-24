import '../../styles.css'

import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TooltipProvider } from '@/client/components/ui/tooltip'
import { liveStore } from '@/client/live/store'
import type { TreeElement } from '@/shared/records/elements'
import type { FrameRecord, SectionRecord } from '@/shared/records/list'
import { frameOf } from '@/test/board'

import { trees } from '../element/tree'
import type { Box } from '../geometry/box'
import { modeStore } from '../mode'
import { enteredStore, leaveFrame } from '../play/entered'
import { clear, selectionStore } from '../selection'
import { attachCanvas } from '../view'
import { LayersList } from './layers-list'

const HERO = frameOf('hero', {
  box: { x: 2000, y: 0, width: 390, height: 844 },
})
const ABOUT = frameOf('about')

/** A canvas showing the top left 800 by 600, recording each box it centers. */
function attachView() {
  const centered: Box[] = []
  const detach = attachCanvas(
    {
      zoomBy: () => {},
      zoomTo: () => {},
      fit: () => {},
      fitTo: () => {},
      panBy: () => {},
      centerOn: (box) => centered.push(box),
      visible: () => ({ x: 0, y: 0, width: 800, height: 600 }),
    },
    'studio/home',
  )
  return { centered, detach }
}

function renderList() {
  render(
    <TooltipProvider>
      <LayersList frames={[ABOUT, HERO]} />
    </TooltipProvider>,
  )
}

/** An element at the top of its frame, named and shaped as `edit` reads a heading. */
function elementOf(index: number, name: string): TreeElement {
  return {
    index,
    parent: null,
    tag: 'h1',
    name,
    textOnly: true,
    layout: 'block',
    round: false,
    placed: false,
  }
}

/** Holds hero's tree entry as the server's answer left it, ready with these elements or still loading. */
function holdTree(elements: TreeElement[] | 'loading') {
  act(() =>
    trees.store.setState({
      byRef: {
        [HERO.ref]:
          elements === 'loading'
            ? { status: 'loading', version: 0 }
            : {
                status: 'ready',
                version: 0,
                tree: { ref: HERO.ref, hash: 'a'.repeat(64), elements },
              },
      },
    }),
  )
}

describe("a frame's element rows across a re-read", () => {
  afterEach(() => {
    act(() => trees.store.setState({ byRef: {} }))
  })

  it('keeps the rows mounted while the tree is read again', async () => {
    holdTree([elementOf(6, 'Headline')])
    renderList()
    await userEvent.click(
      screen.getByRole('button', { name: 'Show the elements of hero' }),
    )
    const row = within(
      screen.getByRole('list', { name: 'Elements of hero' }),
    ).getByText('Headline')

    holdTree('loading')

    expect(
      within(screen.getByRole('list', { name: 'Elements of hero' })).getByText(
        'Headline',
      ),
    ).toBe(row)
    expect(screen.queryByText('Reading elements')).toBeNull()
  })

  it('drops a row the new tree no longer holds', async () => {
    holdTree([elementOf(6, 'Headline'), elementOf(7, 'Footer')])
    renderList()
    await userEvent.click(
      screen.getByRole('button', { name: 'Show the elements of hero' }),
    )
    holdTree('loading')

    holdTree([elementOf(6, 'Headline')])

    expect(
      within(
        screen.getByRole('list', { name: 'Elements of hero' }),
      ).queryByText('Footer'),
    ).toBeNull()
  })

  it('says it is reading on a first read', async () => {
    holdTree('loading')
    renderList()

    await userEvent.click(
      screen.getByRole('button', { name: 'Show the elements of hero' }),
    )

    expect(screen.getByText('Reading elements')).toBeVisible()
  })
})

describe("an element row's eye and lock", () => {
  /** The body of each edit the rows sent, each answered as written. */
  let sent: unknown[]
  const hash = 'a'.repeat(64)

  beforeEach(() => {
    sent = []
    act(() => liveStore.setState({ canWrite: true }))
    vi.spyOn(window, 'fetch').mockImplementation(async (url, init) => {
      if (url === '/api/frames/edit') {
        sent.push(JSON.parse(String(init?.body)))
      }
      return Response.json({
        ok: true,
        data: { ref: HERO.ref, index: 6, indexes: [6], hash, elements: [] },
      })
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    act(() => liveStore.setState({ canWrite: false }))
    act(() => trees.store.setState({ byRef: {} }))
  })

  /** Opens hero's rows, hero holding these elements. */
  async function open(elements: TreeElement[]) {
    holdTree(elements)
    renderList()
    await userEvent.click(
      screen.getByRole('button', { name: 'Show the elements of hero' }),
    )
  }

  it('hides the element it is pressed on', async () => {
    await open([elementOf(6, 'Headline')])

    await userEvent.click(screen.getByRole('button', { name: 'Hide Headline' }))

    await vi.waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]).toMatchObject({
      ref: HERO.ref,
      hash: 'a'.repeat(64),
      edits: [{ index: 6, change: { kind: 'hidden', value: true } }],
    })
  })

  it('shows a hidden element again', async () => {
    await open([{ ...elementOf(6, 'Headline'), hidden: true }])

    await userEvent.click(screen.getByRole('button', { name: 'Show Headline' }))

    await vi.waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]).toMatchObject({
      edits: [{ index: 6, change: { kind: 'hidden', value: false } }],
    })
  })

  it('locks the element in its file', async () => {
    await open([elementOf(6, 'Headline')])

    await userEvent.click(screen.getByRole('button', { name: 'Lock Headline' }))

    await vi.waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]).toMatchObject({
      edits: [
        {
          index: 6,
          change: { kind: 'attribute', name: 'data-locked', value: '' },
        },
      ],
    })
  })

  it('unlocks a locked element', async () => {
    await open([{ ...elementOf(6, 'Headline'), locked: true }])

    await userEvent.click(
      screen.getByRole('button', { name: 'Unlock Headline' }),
    )

    await vi.waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]).toMatchObject({
      edits: [
        {
          index: 6,
          change: { kind: 'attribute', name: 'data-locked', remove: true },
        },
      ],
    })
  })

  it('shows its state and takes no press in a tab that may not write', async () => {
    act(() => liveStore.setState({ canWrite: false }))
    await open([{ ...elementOf(6, 'Headline'), hidden: true, locked: true }])

    const eye = screen.getByRole('button', { name: 'Show Headline' })
    const lock = screen.getByRole('button', { name: 'Unlock Headline' })

    expect(
      [eye, lock].map((button) => getComputedStyle(button).opacity),
    ).toEqual(['1', '1'])
    expect(eye).toBeDisabled()
    expect(lock).toBeDisabled()
  })

  it('draws only on the row hover or focus while both are off', async () => {
    await open([elementOf(6, 'Headline')])
    const eye = screen.getByRole('button', { name: 'Hide Headline' })
    act(() => (document.activeElement as HTMLElement | null)?.blur())
    await userEvent.unhover(eye)
    expect(getComputedStyle(eye).opacity).toBe('0')

    act(() => eye.focus())

    expect(getComputedStyle(eye).opacity).toBe('1')
  })

  it('dims a hidden parent and what it holds, and not its sibling', async () => {
    await open([
      { ...elementOf(6, 'Card'), textOnly: false, hidden: true },
      { ...elementOf(7, 'Title'), parent: 6 },
      elementOf(8, 'Footer'),
    ])
    await userEvent.click(
      screen.getByRole('button', { name: 'Show what Card holds' }),
    )

    const rows = within(
      screen.getByRole('list', { name: 'Elements of hero' }),
    ).getAllByRole('listitem')

    expect(rows.map((row) => row.getAttribute('aria-label'))).toEqual([
      'Card, hidden',
      'Title, hidden',
      null,
    ])
    const [card, title, footer] = rows.map((row) => getComputedStyle(row).color)
    expect(title).toBe(card)
    expect(footer).not.toBe(card)
    expect(screen.getByRole('button', { name: 'Hide Title' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })
})

describe('a layers row in Play', () => {
  let detach = () => {}

  beforeEach(() => {
    modeStore.setState({ mode: 'play' })
  })

  afterEach(() => {
    detach()
    leaveFrame()
    clear(selectionStore)
    modeStore.setState({ mode: 'edit', tool: 'move' })
  })

  it('enters its frame', async () => {
    detach = attachView().detach
    renderList()

    await userEvent.click(screen.getByRole('button', { name: 'Select hero' }))

    expect(enteredStore.getState().ref).toBe(HERO.ref)
  })

  it('brings its frame into view', async () => {
    const view = attachView()
    detach = view.detach
    renderList()

    await userEvent.click(screen.getByRole('button', { name: 'Select hero' }))

    expect(view.centered).toEqual([HERO.box])
  })

  it('writes no selection', async () => {
    detach = attachView().detach
    renderList()

    await userEvent.click(screen.getByRole('button', { name: 'Select hero' }))

    expect(selectionStore.getState().frames).toEqual([])
  })
})

describe('a layers row picked with a modifier key', () => {
  const [A, B, C, D, E] = ['a', 'b', 'c', 'd', 'e'].map((name) => frameOf(name))
  /** Bottom of the stack first, as the server sends them, so Layers lists a to e. */
  const FRAMES = [E, D, C, B, A].flatMap((frame) => (frame ? [frame] : []))
  const section = (name: string, frames: string[]): SectionRecord => ({
    name,
    box: { x: 0, y: 0, width: 100, height: 100 },
    order: 0,
    frames,
  })
  let detach = () => {}

  afterEach(() => {
    detach()
    clear(selectionStore)
  })

  function renderRows(
    frames: readonly FrameRecord[] = FRAMES,
    sections: readonly SectionRecord[] = [],
  ) {
    detach = attachView().detach
    render(
      <TooltipProvider>
        <LayersList frames={frames} sections={sections} />
      </TooltipProvider>,
    )
  }

  const row = (name: string) =>
    screen.getByRole('button', { name: `Select ${name}` })
  const selected = () => [...selectionStore.getState().frames].sort()
  const refs = (...names: string[]) =>
    names.map((name) => `studio/home/${name}`)

  async function clickWith(key: string, name: string) {
    const user = userEvent.setup()
    await user.keyboard(`{${key}>}`)
    await user.click(row(name))
    await user.keyboard(`{/${key}}`)
  }

  it('selects every row from the anchor forward to a Shift-clicked row', async () => {
    renderRows()
    await userEvent.click(row('b'))

    await clickWith('Shift', 'd')

    expect(selected()).toEqual(refs('b', 'c', 'd'))
  })

  it('selects every row from the anchor back to a Shift-clicked row', async () => {
    renderRows()
    await userEvent.click(row('d'))

    await clickWith('Shift', 'a')

    expect(selected()).toEqual(refs('a', 'b', 'c', 'd'))
  })

  it('spans from the same anchor on a second Shift-click', async () => {
    renderRows()
    await userEvent.click(row('c'))
    await clickWith('Shift', 'e')

    await clickWith('Shift', 'a')

    expect(selected()).toEqual(refs('a', 'b', 'c'))
  })

  it('spans across a section into the rows below it', async () => {
    renderRows(FRAMES, [section('Top', ['a', 'b'])])
    await userEvent.click(row('a'))

    await clickWith('Shift', 'd')

    expect(selected()).toEqual(refs('a', 'b', 'c', 'd'))
  })

  it('leaves out a collapsed section and a hidden frame', async () => {
    const hidden = FRAMES.map((frame) =>
      frame.name === 'd' ? { ...frame, hidden: true } : frame,
    )
    // Bottom first, so Layers lists Top then Mid.
    renderRows(hidden, [section('Mid', ['c']), section('Top', ['a', 'b'])])
    await userEvent.click(
      screen.getByRole('button', { name: 'Hide the frames of Mid' }),
    )
    await userEvent.click(row('b'))

    await clickWith('Shift', 'e')

    expect(selected()).toEqual(refs('b', 'e'))
  })

  it('spans from a row clicked just before, ahead of the next render', () => {
    renderRows()

    act(() => {
      row('b').click()
      row('d').dispatchEvent(
        new MouseEvent('click', { bubbles: true, shiftKey: true }),
      )
    })

    expect(selected()).toEqual(refs('b', 'c', 'd'))
  })

  it('selects a Shift-clicked row alone with nothing selected', async () => {
    renderRows()

    await clickWith('Shift', 'c')

    expect(selected()).toEqual(refs('c'))
  })

  it.each(['Control', 'Meta'])(
    'adds one row and takes it out again on %s-click',
    async (key) => {
      renderRows()
      await userEvent.click(row('a'))

      await clickWith(key, 'c')
      const added = selected()
      await clickWith(key, 'a')

      expect(added).toEqual(refs('a', 'c'))
      expect(selected()).toEqual(refs('c'))
    },
  )
})
