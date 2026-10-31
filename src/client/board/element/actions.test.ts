import { afterEach, describe, expect, it } from 'vitest'

import {
  type Action,
  bindKeys,
  registerActions,
} from '@/client/actions/registry'
import type { ElementTree } from '@/shared/records/elements'

import { createModeStore } from '../mode'
import { createSelectionStore, select, selectElement } from '../selection'
import { elementActions, focusOnBoard } from './actions'

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
} = {}) {
  const selection = createSelectionStore()
  const mode = createModeStore(1280)
  const deleted: unknown[][] = []
  /** Each move asked for, with the place it lands an element holding place 1 on. */
  const moved: unknown[][] = []
  const actions = elementActions({
    page: () => PAGE,
    selection,
    mode,
    treeOf: () => tree,
    noteOpen: () => noteOpen,
    boardFocused,
    writable: () => writable,
    remove: (...args) => void deleted.push(args),
    move: (at, key, to) => void moved.push([at, key, to(1)]),
  })
  const action = (id: string): Action => {
    const found = actions.find((candidate) => candidate.id === id)
    if (!found) throw new Error(`no action ${id}`)
    return found
  }
  const at = (index: number) =>
    selectElement(selection, PAGE, { frame: HERO, index, hash: HASH })
  return { selection, mode, action, at, actions, deleted, moved }
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

    expect(deleted).toEqual([[PAGE, { frame: HERO, index: 7, hash: HASH }]])
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
