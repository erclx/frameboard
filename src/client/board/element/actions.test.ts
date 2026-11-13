import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  type Action,
  bindKeys,
  registerActions,
} from '@/client/actions/registry'
import { CommandPalette } from '@/client/palette/commands'
import { openOverlay } from '@/client/palette/overlay'
import type { ElementTree } from '@/shared/records/elements'

import { NUDGE_REST_MS } from '../geometry/actions'
import { createModeStore } from '../mode'
import {
  createSelectionStore,
  select,
  selectElement,
  selectElements,
} from '../selection'
import { elementActions, focusOnBoard } from './actions'
import type { GroupMember, MemberEdit } from './group'

const PAGE = 'studio/home'
const HERO = 'studio/home/hero'
const HASH = 'a'.repeat(64)

// <main 6><h1 7/><p 8/></main><footer 9/>
const TREE: ElementTree = {
  ref: HERO,
  hash: HASH,
  elements: [
    {
      index: 6,
      parent: null,
      tag: 'main',
      name: 'main',
      textOnly: false,
      layout: 'block',
      round: false,
      placed: false,
    },
    {
      index: 7,
      parent: 6,
      tag: 'h1',
      name: 'Hi',
      textOnly: true,
      layout: 'block',
      round: false,
      placed: false,
    },
    {
      index: 8,
      parent: 6,
      tag: 'p',
      name: 'x',
      textOnly: true,
      layout: 'block',
      round: false,
      placed: false,
    },
    {
      index: 9,
      parent: null,
      tag: 'footer',
      name: 'footer',
      textOnly: false,
      layout: 'block',
      round: false,
      placed: false,
    },
  ],
}

function setup({
  noteOpen = false,
  tree = TREE as ElementTree | null,
  boardFocused = (): boolean => true,
  writable = true,
  members = null as readonly GroupMember[] | null,
  held = false,
} = {}) {
  const selection = createSelectionStore()
  const mode = createModeStore(1280)
  const deleted: unknown[][] = []
  /** Each move asked for, with the place it lands an element holding place 1 of 3 on. */
  const moved: unknown[][] = []
  /** Each wrap asked for, with the keys and the request it carried. */
  const wraps: unknown[][] = []
  /** Each group edit a nudge run started, with what it previewed and wrote. */
  const edits: {
    previews: (readonly MemberEdit[])[]
    commits: (readonly MemberEdit[])[]
    cancelled: boolean
  }[] = []
  const actions = elementActions({
    page: () => PAGE,
    selection,
    mode,
    treeOf: () => tree,
    noteOpen: () => noteOpen,
    boardFocused,
    writable: () => writable,
    remove: (...args) => void deleted.push(args),
    move: (at, key, to) => void moved.push([at, key, to(1, 3)]),
    group: () => members,
    wrap: (...args) => void wraps.push(args),
    editGroup: () => {
      if (held) return null
      const edit = {
        previews: [] as (readonly MemberEdit[])[],
        commits: [] as (readonly MemberEdit[])[],
        cancelled: false,
      }
      edits.push(edit)
      return {
        preview: (made) => edit.previews.push(made),
        commit: async (made) => {
          edit.commits.push(made)
          return true
        },
        cancel: () => {
          edit.cancelled = true
        },
      }
    },
  })
  const action = (id: string): Action => {
    const found = actions.find((candidate) => candidate.id === id)
    if (!found) throw new Error(`no action ${id}`)
    return found
  }
  const at = (index: number) =>
    selectElement(selection, PAGE, { frame: HERO, index, hash: HASH })
  return {
    selection,
    mode,
    action,
    at,
    actions,
    deleted,
    moved,
    edits,
    wraps,
  }
}

const cleanups: (() => void)[] = []

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.()
})

/** A focused button outside the canvas, as a layers row or a toolbar button is. */
function focusedButton(): void {
  const button = document.createElement('button')
  document.body.append(button)
  button.focus()
  cleanups.push(() => button.remove())
}

describe('elementActions', () => {
  it('binds Enter, Esc, Tab, and Shift+Tab', () => {
    const { action } = setup()

    expect(
      ['element.down', 'element.up', 'element.next', 'element.previous'].map(
        (id) => action(id).keys,
      ),
    ).toEqual([['Enter'], ['Escape'], ['Tab'], ['Shift+Tab']])
  })

  describe('Enter', () => {
    it("goes from a frame to body's first child", () => {
      const { selection, action } = setup()
      select(selection, PAGE, [HERO])

      action('element.down').run()

      expect(selection.getState().element).toEqual({
        frame: HERO,
        index: 6,
        hash: HASH,
      })
    })

    it('stands aside at an element with no children', () => {
      const { action, at } = setup()
      at(7)

      expect(action('element.down').enabled?.()).toBe(false)
    })

    it('stands aside while a panel button holds focus, so Enter presses it', () => {
      const { selection, action } = setup({ boardFocused: focusOnBoard })
      select(selection, PAGE, [HERO])

      focusedButton()

      expect(action('element.down').enabled?.()).toBe(false)
    })

    it('stands aside while a note pin on the canvas holds focus, so Enter opens it', () => {
      const { selection, action } = setup({ boardFocused: focusOnBoard })
      select(selection, PAGE, [HERO])

      const canvas = document.createElement('div')
      canvas.setAttribute('data-canvas', '')
      const pin = document.createElement('button')
      pin.setAttribute('data-note-marker', '')
      canvas.append(pin)
      document.body.append(canvas)
      cleanups.push(() => canvas.remove())
      pin.focus()

      expect(action('element.down').enabled?.()).toBe(false)
    })

    it('stands aside while a row of a note card on the canvas holds focus, so Enter and Tab press it', () => {
      const { action, at } = setup({ boardFocused: focusOnBoard })
      at(6)

      const canvas = document.createElement('div')
      canvas.setAttribute('data-canvas', '')
      const card = document.createElement('section')
      card.setAttribute('data-note-card', '')
      const row = document.createElement('button')
      card.append(row)
      canvas.append(card)
      document.body.append(canvas)
      cleanups.push(() => canvas.remove())
      row.focus()

      expect([
        action('element.down').enabled?.(),
        action('element.next').enabled?.(),
      ]).toEqual([false, false])
    })

    it('stands aside while a button of a media bar on the canvas holds focus, so Tab moves through the bar', () => {
      const { action, at } = setup({ boardFocused: focusOnBoard })
      at(6)

      const canvas = document.createElement('div')
      canvas.setAttribute('data-canvas', '')
      const bar = document.createElement('div')
      bar.setAttribute('data-media-bar', '')
      const play = document.createElement('button')
      bar.append(play)
      canvas.append(bar)
      document.body.append(canvas)
      cleanups.push(() => canvas.remove())
      play.focus()

      expect([
        action('element.next').enabled?.(),
        action('element.previous').enabled?.(),
      ]).toEqual([false, false])
    })

    it('stands aside with several frames selected', () => {
      const { selection, action } = setup()
      select(selection, PAGE, [HERO, 'studio/home/about'])

      expect(action('element.down').enabled?.()).toBe(false)
    })

    it('stands aside until the frame tree has loaded', () => {
      const { selection, action } = setup({ tree: null })
      select(selection, PAGE, [HERO])

      expect(action('element.down').enabled?.()).toBe(false)
    })
  })

  describe('Esc', () => {
    it('goes up to the parent element', () => {
      const { selection, action, at } = setup()
      at(8)

      action('element.up').run()

      expect(selection.getState().element?.index).toBe(6)
    })

    it('goes from a child of body to the frame', () => {
      const { selection, action, at } = setup()
      at(6)

      action('element.up').run()

      expect(selection.getState()).toMatchObject({
        frames: [HERO],
        element: null,
      })
    })

    it('stands aside at a frame, so the selection clears', () => {
      const { selection, action } = setup()
      select(selection, PAGE, [HERO])

      expect(action('element.up').enabled?.()).toBe(false)
    })

    it('holds the press while a note card is open, so the selection stays', () => {
      const { selection, actions, at } = setup({ noteOpen: true })
      at(7)
      let cleared = false
      cleanups.push(
        registerActions(actions),
        registerActions([
          {
            id: 'selection.clear',
            label: 'Clear selection',
            group: 'selection',
            palette: false,
            keys: ['Escape'],
            run: () => (cleared = true),
          },
        ]),
        bindKeys(window),
      )

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))

      expect(cleared).toBe(false)
      expect(selection.getState().element?.index).toBe(7)
    })

    it('stands aside in Play', () => {
      const { mode, action, at } = setup()
      at(7)

      mode.setState({ mode: 'play' })

      expect(action('element.up').enabled?.()).toBe(false)
    })

    it('stands aside with a tool armed, which Esc returns to Move first', () => {
      const { mode, action, at } = setup()
      at(7)

      mode.setState({ tool: 'shape' })

      expect(action('element.up').enabled?.()).toBe(false)
    })
  })

  describe('Tab', () => {
    it('wraps from the last sibling to the first', () => {
      const { selection, action, at } = setup()
      at(8)

      action('element.next').run()

      expect(selection.getState().element?.index).toBe(7)
    })

    it('wraps from the first sibling to the last with Shift', () => {
      const { selection, action, at } = setup()
      at(7)

      action('element.previous').run()

      expect(selection.getState().element?.index).toBe(8)
    })

    it('stands aside at a frame, so focus moves as usual', () => {
      const { selection, action } = setup()
      select(selection, PAGE, [HERO])

      expect(action('element.next').enabled?.()).toBe(false)
    })

    it('stands aside while a panel button holds focus, so Tab moves focus', () => {
      const { action, at } = setup({ boardFocused: focusOnBoard })
      at(7)

      focusedButton()

      expect(action('element.next').enabled?.()).toBe(false)
    })

    it('stands aside once the tree is read from other bytes', () => {
      const { action, at } = setup({
        tree: { ...TREE, hash: 'b'.repeat(64) },
      })
      at(7)

      expect(action('element.next').enabled?.()).toBe(false)
    })
  })
})

describe('element.delete', () => {
  it('binds Delete and Backspace', () => {
    const { action } = setup()

    expect(action('element.delete').keys).toEqual(['Backspace', 'Delete'])
  })

  it('deletes the selected element at the hash it was selected at', () => {
    const { action, at, deleted } = setup()
    at(7)

    action('element.delete').run()

    expect(deleted).toEqual([[PAGE, [{ frame: HERO, index: 7, hash: HASH }]]])
  })

  it('deletes every selected element in one call', () => {
    const { action, selection, deleted } = setup()
    const keys = [
      { frame: HERO, index: 7, hash: HASH },
      { frame: HERO, index: 8, hash: HASH },
    ]
    selectElements(selection, PAGE, keys)

    action('element.delete').run()

    expect(deleted).toEqual([[PAGE, keys]])
  })

  it('stands aside with a frame selected, so the frame delete runs', () => {
    const { selection, action } = setup()

    select(selection, PAGE, [HERO])

    expect(action('element.delete').enabled?.()).toBe(false)
  })

  it('stands aside while the tab may not write', () => {
    const { action, at } = setup({ writable: false })

    at(7)

    expect(action('element.delete').enabled?.()).toBe(false)
  })

  it('stands aside in Play', () => {
    const { mode, action, at } = setup()
    at(7)

    mode.setState({ mode: 'play' })

    expect(action('element.delete').enabled?.()).toBe(false)
  })
})

describe('element.moveUp and element.moveDown', () => {
  it('binds Alt+Shift+ArrowUp and Alt+Shift+ArrowDown', () => {
    const { action } = setup()

    expect(
      ['element.moveUp', 'element.moveDown'].map((id) => action(id).keys),
    ).toEqual([['Alt+Shift+ArrowUp'], ['Alt+Shift+ArrowDown']])
  })

  it('moves the selected element one place up among its siblings', () => {
    const { action, at, moved } = setup()
    at(8)

    action('element.moveUp').run()

    expect(moved).toEqual([[PAGE, { frame: HERO, index: 8, hash: HASH }, 0]])
  })

  it('moves the selected element one place down among its siblings', () => {
    const { action, at, moved } = setup()
    at(7)

    action('element.moveDown').run()

    expect(moved).toEqual([[PAGE, { frame: HERO, index: 7, hash: HASH }, 2]])
  })

  it('holds the press at the first child, so it never reaches a frame key', () => {
    const { action, at } = setup()

    at(7)

    expect(action('element.moveUp').enabled?.()).toBe(true)
  })

  it('stands aside with a frame selected', () => {
    const { selection, action } = setup()

    select(selection, PAGE, [HERO])

    expect(action('element.moveDown').enabled?.()).toBe(false)
  })

  it('stands aside while a panel button holds focus', () => {
    const { action, at } = setup({ boardFocused: () => false })

    at(7)

    expect(action('element.moveDown').enabled?.()).toBe(false)
  })

  it('stands aside while the tab may not write', () => {
    const { action, at } = setup({ writable: false })

    at(7)

    expect(action('element.moveDown').enabled?.()).toBe(false)
  })
})

describe('element.toFront and element.toBack', () => {
  it('brings the selected element to the last place among its siblings', () => {
    const { action, at, moved } = setup()
    at(7)

    action('element.toFront').run()

    expect(moved).toEqual([[PAGE, { frame: HERO, index: 7, hash: HASH }, 2]])
  })

  it('sends the selected element to the first place among its siblings', () => {
    const { action, at, moved } = setup()
    at(8)

    action('element.toBack').run()

    expect(moved).toEqual([[PAGE, { frame: HERO, index: 8, hash: HASH }, 0]])
  })

  it('stands Bring to front aside on the last sibling', () => {
    const { action, at } = setup()

    at(8)

    expect(action('element.toFront').enabled?.()).toBe(false)
  })

  it('stands Send to back aside on the first sibling', () => {
    const { action, at } = setup()

    at(7)

    expect(action('element.toBack').enabled?.()).toBe(false)
  })

  it('stands aside while the tab may not write', () => {
    const { action, at } = setup({ writable: false })

    at(7)

    expect(action('element.toFront').enabled?.()).toBe(false)
  })
})

describe('element.forward and element.backward', () => {
  it('brings the selected element one place forward', () => {
    const { action, at, moved } = setup()
    at(7)

    action('element.forward').run()

    expect(moved).toEqual([[PAGE, { frame: HERO, index: 7, hash: HASH }, 2]])
  })

  it('stands Bring forward aside on the last sibling', () => {
    const { action, at } = setup()

    at(8)

    expect(action('element.forward').enabled?.()).toBe(false)
  })

  it('stands Send backward aside on the first sibling', () => {
    const { action, at } = setup()

    at(7)

    expect(action('element.backward').enabled?.()).toBe(false)
  })

  it('stays enabled while a panel button holds focus, as the Layers menu opens', () => {
    const { action, at } = setup({ boardFocused: () => false })

    at(7)

    expect(action('element.forward').enabled?.()).toBe(true)
  })

  it('is found in the palette by its name', async () => {
    const { actions, at } = setup({ boardFocused: () => false })
    at(7)
    cleanups.push(registerActions(actions))
    render(createElement(CommandPalette))
    act(() => openOverlay('commands'))
    cleanups.push(() => act(() => openOverlay(null)))

    await userEvent.type(await screen.findByRole('combobox'), 'bring forward')

    expect(
      await screen.findByRole('option', { name: 'Bring forward' }),
    ).toBeInTheDocument()
  })
})

describe('nudging elements', () => {
  const BOX = { kind: 'box', inset: { width: 0, height: 0 } } as const
  const FREE: GroupMember[] = [
    {
      index: 7,
      box: { x: 0, y: 0, width: 10, height: 10 },
      placed: { left: 10, top: 20 },
      read: BOX,
    },
    {
      index: 8,
      box: { x: 0, y: 50, width: 10, height: 10 },
      placed: { left: 10, top: 70 },
      read: BOX,
    },
  ]
  const both = (selection: ReturnType<typeof setup>['selection']) =>
    selectElements(selection, PAGE, [
      { frame: HERO, index: 7, hash: HASH },
      { frame: HERO, index: 8, hash: HASH },
    ])

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('writes a run of presses on every free element once, after the rest', () => {
    const { selection, action, edits } = setup({ members: FREE })
    both(selection)

    action('element.nudgeRight').run()
    action('element.nudgeRight').run()
    action('element.nudgeDownFar').run()
    expect(edits[0]?.commits).toEqual([])
    vi.advanceTimersByTime(NUDGE_REST_MS)

    expect(edits).toHaveLength(1)
    expect(edits[0]?.commits).toEqual([
      [
        {
          index: 7,
          declarations: [
            { property: 'left', value: '12px' },
            { property: 'top', value: '30px' },
          ],
        },
        {
          index: 8,
          declarations: [
            { property: 'left', value: '12px' },
            { property: 'top', value: '80px' },
          ],
        },
      ],
    ])
  })

  it('moves one selected free element too', () => {
    const { action, at, edits } = setup({ members: FREE.slice(0, 1) })
    at(7)

    action('element.nudgeLeft').run()
    vi.advanceTimersByTime(NUDGE_REST_MS)

    expect(edits[0]?.commits[0]?.[0]?.declarations[0]).toEqual({
      property: 'left',
      value: '9px',
    })
  })

  it('stands aside for the frame while no selected element is free', () => {
    const { selection, action } = setup({
      members: FREE.map((member) => ({ ...member, placed: null })),
    })
    both(selection)

    expect(action('element.nudgeLeft').enabled?.()).toBe(false)
  })

  it('stands aside while focus sits on a control', () => {
    const { selection, action } = setup({
      members: FREE,
      boardFocused: () => false,
    })
    both(selection)

    expect(action('element.nudgeLeft').enabled?.()).toBe(false)
  })

  it('writes nothing in a frame another session holds', () => {
    const { selection, action, edits } = setup({ members: FREE, held: true })
    both(selection)

    action('element.nudgeLeft').run()
    vi.advanceTimersByTime(NUDGE_REST_MS)

    expect(edits).toEqual([])
  })

  it('sends the run so far before a press on another selection starts its own', () => {
    const { selection, action, at, edits } = setup({ members: FREE })
    both(selection)

    action('element.nudgeRight').run()
    at(7)
    action('element.nudgeRight').run()

    expect(edits).toHaveLength(2)
    expect(edits[0]?.commits).toHaveLength(1)
  })
})

describe('arranging elements', () => {
  const BOX = { kind: 'box', inset: { width: 0, height: 0 } } as const
  const FREE: GroupMember[] = [
    {
      index: 7,
      box: { x: 0, y: 0, width: 10, height: 10 },
      placed: { left: 0, top: 0 },
      read: BOX,
    },
    {
      index: 8,
      box: { x: 40, y: 50, width: 10, height: 10 },
      placed: { left: 40, top: 50 },
      read: BOX,
    },
  ]
  const both = (selection: ReturnType<typeof setup>['selection']) =>
    selectElements(selection, PAGE, [
      { frame: HERO, index: 7, hash: HASH },
      { frame: HERO, index: 8, hash: HASH },
    ])

  it('aligns every free element as one write', () => {
    const { selection, action, edits } = setup({ members: FREE })
    both(selection)

    action('element.alignTop').run()

    expect(edits[0]?.commits).toEqual([
      [
        {
          index: 8,
          declarations: [
            { property: 'left', value: '40px' },
            { property: 'top', value: '0px' },
          ],
        },
      ],
    ])
  })

  it('stands disabled while one element sits in the flow', () => {
    const { selection, action } = setup({
      members: [
        FREE[0] as GroupMember,
        { ...(FREE[1] as GroupMember), placed: null },
      ],
    })
    both(selection)

    expect(action('element.alignTop').enabled?.()).toBe(false)
  })

  it('distributes only from a third element on', () => {
    const { selection, action } = setup({ members: FREE })
    both(selection)

    expect(action('element.distributeHorizontal').enabled?.()).toBe(false)
  })
})

describe('wrapping elements', () => {
  const BOX = { kind: 'box', inset: { width: 0, height: 0 } } as const
  const FREE: GroupMember[] = [
    {
      index: 7,
      box: { x: 10, y: 20, width: 40, height: 18 },
      placed: { left: 10, top: 20 },
      read: BOX,
    },
    {
      index: 8,
      box: { x: 98, y: 20, width: 50, height: 18 },
      placed: { left: 98, top: 24 },
      read: BOX,
    },
  ]
  const select = (
    selection: ReturnType<typeof setup>['selection'],
    indexes: number[],
  ) =>
    selectElements(
      selection,
      PAGE,
      indexes.map((index) => ({ frame: HERO, index, hash: HASH })),
    )

  it('wraps two free siblings in a row with their spacing, placed where the group sat', () => {
    const { selection, action, wraps } = setup({ members: FREE })
    select(selection, [7, 8])

    action('element.wrap').run()

    expect(wraps).toEqual([
      [
        PAGE,
        [
          { frame: HERO, index: 7, hash: HASH },
          { frame: HERO, index: 8, hash: HASH },
        ],
        {
          flow: { direction: 'row', gap: 48 },
          spot: { left: 10, top: 20 },
        },
      ],
    ])
  })

  it('keeps the container in the flow while a member sits there', () => {
    const { selection, action, wraps } = setup({
      members: [
        FREE[0] as GroupMember,
        { ...(FREE[1] as GroupMember), placed: null },
      ],
    })
    select(selection, [7, 8])

    action('element.wrap').run()

    expect(wraps[0]?.[2]).toMatchObject({ spot: null })
  })

  it('wraps one element on its own', () => {
    const { action, at } = setup({ members: FREE.slice(0, 1) })
    at(7)

    expect(action('element.wrap').enabled?.()).toBe(true)
  })

  it('stands disabled for elements of different parents', () => {
    // The main at 6 and its own h1 at 7.
    const { selection, action } = setup({ members: FREE })
    select(selection, [6, 7])

    expect(action('element.wrap').enabled?.()).toBe(false)
  })

  it('stands disabled while the tree reads other bytes', () => {
    const { selection, action } = setup({
      members: FREE,
      tree: { ...TREE, hash: 'f'.repeat(64) },
    })
    select(selection, [7, 8])

    expect(action('element.wrap').enabled?.()).toBe(false)
  })
})
