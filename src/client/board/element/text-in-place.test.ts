import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { EDITING } from '@/shared/frame-bridge/messages'
import { frameOf } from '@/test/board'

import { request } from '../bridge/channel'
import type { ElementChange } from '../inspector/element/write'
import { createSelectionStore, selectElement } from '../selection'
import { heldMeasures, useMeasures } from './measures'
import {
  editTextInPlace,
  editTextWhenShown,
  newTextStore,
  overElement,
  pressInEdit,
} from './text-in-place'

const HASH = 'c'.repeat(64)
const NEXT = 'd'.repeat(64)
const FRAME = 'studio/home/hero'

// Indices: html 0, head 1, the injected style and script are skipped, body 2, h1 3.
const KEY = { frame: FRAME, index: 3, hash: HASH }

let container: HTMLDivElement | undefined

afterEach(() => {
  container?.remove()
  container = undefined
  newTextStore.setState({ key: null })
})

function source(body: string, hash = HASH): string {
  return `<!doctype html><html><head><style data-frameboard data-hash="${hash}"></style><script data-frameboard type="module" src="/src/frame-bridge/main.ts"></script></head><body>${body}</body></html>`
}

/** Shows `html` in the frame's iframe, resolved once it has loaded. */
function show(iframe: HTMLIFrameElement, html: string): Promise<void> {
  const loaded = new Promise<void>((resolve) =>
    iframe.addEventListener('load', () => resolve(), { once: true }),
  )
  iframe.srcdoc = html
  return loaded
}

async function mount(body = '<h1>Old</h1>') {
  container = document.createElement('div')
  const frame = document.createElement('div')
  frame.dataset.frame = FRAME
  const iframe = document.createElement('iframe')
  frame.append(iframe)
  container.append(frame)
  document.body.append(container)
  await show(iframe, source(body))
  const shown = iframe.contentDocument
  const heading = shown?.querySelector('h1')
  if (!shown || !heading) throw new Error('The frame shows no heading.')
  return { container, iframe, shown, heading }
}

/**
 * Resolves once every message the frame posted before now has reached the
 * board, since the frame answers a later request after it.
 */
async function settled(iframe: HTMLIFrameElement): Promise<void> {
  await request(iframe, 'element-box', { index: 0, hash: '' })
}

/** A writer recording each batch of changes it is handed, answering `written`. */
function recorder(written = true) {
  const changes: (readonly ElementChange[])[] = []
  const write = async (batch: readonly ElementChange[]) => {
    changes.push(batch)
    return written
  }
  return { changes, write }
}

/** Pastes `text` as plain text into the element, at the caret. */
function paste(target: HTMLElement, text: string) {
  const data = new DataTransfer()
  data.setData('text/plain', text)
  target.dispatchEvent(
    new ClipboardEvent('paste', { clipboardData: data, bubbles: true }),
  )
}

/** Puts the caret at the end of the element's text, as a click past it would. */
function caretAtEnd(shown: Document, element: HTMLElement) {
  const range = shown.createRange()
  range.selectNodeContents(element)
  range.collapse(false)
  shown.getSelection()?.removeAllRanges()
  shown.getSelection()?.addRange(range)
}

function press(target: HTMLElement, key: string, shiftKey = false) {
  target.dispatchEvent(
    new KeyboardEvent('keydown', { key, shiftKey, bubbles: true }),
  )
}

describe('editTextInPlace', () => {
  it('opens the text for typing with all of it selected', async () => {
    const { container, shown, heading } = await mount()

    const opened = await editTextInPlace(container, KEY, recorder().write)
      .opened

    expect(opened).toBe(true)
    expect(heading.getAttribute('contenteditable')).toBe('plaintext-only')
    expect(shown.activeElement).toBe(heading)
    expect(shown.getSelection()?.toString()).toBe('Old')
  })

  it('adds a line on Enter and keeps the edit open', async () => {
    const { container, iframe, shown, heading } = await mount()
    const { changes, write } = recorder()
    await editTextInPlace(container, KEY, write).opened

    caretAtEnd(shown, heading)
    press(heading, 'Enter')
    await settled(iframe)

    expect(heading.textContent).toMatch(/^Old\n/)
    expect(heading.getAttribute('contenteditable')).toBe('plaintext-only')
    expect(changes).toEqual([])
  })

  it('adds a line on Shift+Enter too', async () => {
    const { container, shown, heading } = await mount()
    await editTextInPlace(container, KEY, recorder().write).opened

    caretAtEnd(shown, heading)
    press(heading, 'Enter', true)

    expect(heading.textContent).toMatch(/^Old\n/)
  })

  it('writes nothing for a line added at the end and left empty', async () => {
    const { container, iframe, shown, heading } = await mount()
    const { changes, write } = recorder()
    await editTextInPlace(container, KEY, write).opened

    caretAtEnd(shown, heading)
    press(heading, 'Enter')
    press(heading, 'Escape')
    await settled(iframe)

    expect(changes).toEqual([])
    expect(heading.textContent).toBe('Old')
  })

  it('writes the typed text on Esc and leaves the element', async () => {
    const { container, heading } = await mount()
    const { changes, write } = recorder()
    await editTextInPlace(container, KEY, write).opened

    heading.textContent = 'New'
    press(heading, 'Escape')

    await expect.poll(() => changes).toEqual([[{ kind: 'text', value: 'New' }]])
    expect(heading.hasAttribute('contenteditable')).toBe(false)
  })

  it('keeps Esc from reaching the frame past the edit', async () => {
    const { container, shown, heading } = await mount()
    await editTextInPlace(container, KEY, recorder().write).opened
    let reached = false
    shown.addEventListener('keydown', () => {
      reached = true
    })

    press(heading, 'Escape')

    expect(reached).toBe(false)
  })

  it('writes the typed text once focus leaves it', async () => {
    const { container, heading } = await mount()
    const { changes, write } = recorder()
    await editTextInPlace(container, KEY, write).opened

    heading.textContent = 'New'
    heading.blur()

    await expect.poll(() => changes).toEqual([[{ kind: 'text', value: 'New' }]])
  })

  it('writes nothing when the text is unchanged', async () => {
    const { container, iframe, heading } = await mount()
    const { changes, write } = recorder()
    await editTextInPlace(container, KEY, write).opened

    press(heading, 'Escape')
    await settled(iframe)

    expect(changes).toEqual([])
  })

  it('writes a typed line with pre-line beside it, as one write', async () => {
    const { container, shown, heading } = await mount()
    const { changes, write } = recorder()
    await editTextInPlace(container, KEY, write).opened

    caretAtEnd(shown, heading)
    press(heading, 'Enter')
    paste(heading, 'Two')
    press(heading, 'Escape')

    await expect
      .poll(() => changes)
      .toEqual([
        [
          { kind: 'text', value: 'Old\nTwo' },
          { kind: 'style', property: 'white-space', value: 'pre-line' },
        ],
      ])
  })

  it('writes no white-space on an element that already keeps its breaks', async () => {
    const { container, heading } = await mount(
      '<h1 style="white-space: pre-wrap">Old</h1>',
    )
    const { changes, write } = recorder()
    await editTextInPlace(container, KEY, write).opened

    heading.textContent = 'One\nTwo'
    press(heading, 'Escape')

    await expect
      .poll(() => changes)
      .toEqual([[{ kind: 'text', value: 'One\nTwo' }]])
  })

  it('writes nothing for a kept-breaks text left as it was, whose source ends on a break', async () => {
    const { container, iframe, heading } = await mount(
      '<h1 style="white-space: pre-wrap">Old\n</h1>',
    )
    const { changes, write } = recorder()
    await editTextInPlace(container, KEY, write).opened

    press(heading, 'Escape')
    await settled(iframe)

    expect(changes).toEqual([])
    expect(heading.textContent).toBe('Old\n')
  })

  it('opens on the text as shown, so the newlines wrapping its source stay spaces', async () => {
    const { container, heading } = await mount(
      '<h1>\n      Old\n      text\n    </h1>',
    )
    const { changes, write } = recorder()
    await editTextInPlace(container, KEY, write).opened

    expect(heading.textContent).toBe('Old text')
    heading.textContent = 'New text'
    press(heading, 'Escape')

    await expect
      .poll(() => changes)
      .toEqual([[{ kind: 'text', value: 'New text' }]])
  })

  it('keeps a pasted line break as one newline', async () => {
    const { container, heading } = await mount()
    const { changes, write } = recorder()
    await editTextInPlace(container, KEY, write).opened

    paste(heading, 'One\r\nTwo')
    press(heading, 'Escape')

    await expect
      .poll(() => changes)
      .toEqual([
        [
          { kind: 'text', value: 'One\nTwo' },
          { kind: 'style', property: 'white-space', value: 'pre-line' },
        ],
      ])
  })

  it('puts the old text back when the write is refused', async () => {
    const { container, heading } = await mount()
    await editTextInPlace(container, KEY, recorder(false).write).opened

    heading.textContent = 'New'
    press(heading, 'Escape')

    await expect.poll(() => heading.textContent).toBe('Old')
  })

  it('keeps the typed text shown while the write lands', async () => {
    const { container, iframe, heading } = await mount()
    const { changes, write } = recorder()
    await editTextInPlace(container, KEY, write).opened

    heading.textContent = 'New'
    press(heading, 'Escape')
    await expect.poll(() => changes).toHaveLength(1)
    await settled(iframe)

    expect(heading.textContent).toBe('New')
  })

  it('puts the old text back once cancelled, writing nothing', async () => {
    const { container, iframe, heading } = await mount()
    const { changes, write } = recorder()
    const edit = editTextInPlace(container, KEY, write)
    await edit.opened

    heading.textContent = 'New'
    edit.cancel()
    await settled(iframe)

    expect(heading.textContent).toBe('Old')
    expect(heading.hasAttribute('contenteditable')).toBe(false)
    expect(changes).toEqual([])
  })

  it('ends with nothing sent once the frame reloads', async () => {
    const { container, iframe, heading } = await mount()
    const { changes, write } = recorder()
    await editTextInPlace(container, KEY, write).opened
    heading.textContent = 'New'

    await show(iframe, source('<h1>Agent</h1>', NEXT))
    await settled(iframe)

    expect(changes).toEqual([])
  })

  it('refuses a frame showing other bytes than the key names', async () => {
    const { container } = await mount()

    const opened = await editTextInPlace(
      container,
      { ...KEY, hash: NEXT },
      recorder().write,
    ).opened

    expect(opened).toBe(false)
  })

  it('opens an empty element when asked, holding a caret one line tall', async () => {
    const { container, shown, heading } = await mount('<h1></h1>')

    const opened = await editTextInPlace(container, KEY, recorder().write, {
      empty: true,
    }).opened

    expect(opened).toBe(true)
    expect(heading.getAttribute('contenteditable')).toBe('plaintext-only')
    expect(shown.activeElement).toBe(heading)
    expect(shown.getSelection()?.isCollapsed).toBe(true)
    expect(heading.getBoundingClientRect().height).toBeGreaterThan(0)
  })

  it('gives an empty element back its own height once the edit ends', async () => {
    const { container, heading } = await mount('<h1></h1>')
    const edit = editTextInPlace(container, KEY, recorder().write, {
      empty: true,
    })
    await edit.opened

    press(heading, 'Escape')
    await expect.poll(() => edit.isOpen()).toBe(false)

    expect(heading.getBoundingClientRect().height).toBe(0)
  })

  it('refuses an empty box, as a placed shape is', async () => {
    const { container, heading } = await mount('<h1></h1>')

    const opened = await editTextInPlace(container, KEY, recorder().write)
      .opened

    expect(opened).toBe(false)
    expect(heading.hasAttribute('contenteditable')).toBe(false)
  })

  it('refuses an element holding more than text', async () => {
    const { container } = await mount('<h1>Hi <em>there</em></h1>')

    const opened = await editTextInPlace(container, KEY, recorder().write)
      .opened

    expect(opened).toBe(false)
  })

  it('hands focus back to the board when it refuses', async () => {
    const { container, iframe } = await mount('<h1>Hi <em>there</em></h1>')
    const field = document.createElement('input')
    container.append(field)
    field.focus()

    await editTextInPlace(container, KEY, recorder().write).opened

    expect(document.activeElement).not.toBe(iframe)
    expect(document.activeElement).toBe(field)
  })
})

describe('editTextInPlace on a run beside a child element', () => {
  const MIXED = '<h1>One <code>x</code> two</h1>'

  /** The frame-local point at the middle of a text node, as a double-click there sends it. */
  function middleOf(shown: Document, node: Node) {
    const range = shown.createRange()
    range.selectNodeContents(node)
    const { left, top, width, height } = range.getBoundingClientRect()
    return { x: left + width / 2, y: top + height / 2 }
  }

  // The frame's nodes come from its own realm, so `instanceof Text` misses them.
  const isText = (node: Node | undefined): node is Text =>
    node?.nodeType === Node.TEXT_NODE

  function runs(heading: HTMLElement) {
    const [first, , last] = heading.childNodes
    const code = heading.querySelector('code')
    if (!isText(first) || !isText(last) || !code) {
      throw new Error('The heading holds no run beside a code.')
    }
    return { first, code, last }
  }

  function inputs(
    target: HTMLElement,
    data: string,
    { inputType = 'insertText', cancelable = true } = {},
  ) {
    target.dispatchEvent(
      new InputEvent('beforeinput', {
        inputType,
        data,
        bubbles: true,
        cancelable,
      }),
    )
  }

  function caretIn(shown: Document, node: Node, offset: number) {
    const range = shown.createRange()
    range.setStart(node, offset)
    range.collapse(true)
    shown.getSelection()?.removeAllRanges()
    shown.getSelection()?.addRange(range)
  }

  it('opens the run under the point, selected, with the child shut to the caret', async () => {
    const { container, shown, heading } = await mount(MIXED)
    const { code, last } = runs(heading)

    const opened = await editTextInPlace(container, KEY, recorder().write, {
      at: middleOf(shown, last),
    }).opened

    expect(opened).toBe(true)
    expect(shown.activeElement).toBe(heading)
    expect(shown.getSelection()?.toString()).toBe(' two')
    expect(code.getAttribute('contenteditable')).toBe('false')
  })

  it('writes the typed run by its index, keeping the child', async () => {
    const { container, shown, heading } = await mount(MIXED)
    const { code, last } = runs(heading)
    const { changes, write } = recorder()
    await editTextInPlace(container, KEY, write, { at: middleOf(shown, last) })
      .opened

    caretIn(shown, last, last.length)
    inputs(heading, '!')
    press(heading, 'Escape')

    await expect
      .poll(() => changes)
      .toEqual([[{ kind: 'text', value: ' two!', run: 1 }]])
    expect(code.textContent).toBe('x')
  })

  it('types at a caret the element names beside the run', async () => {
    const { container, shown, heading } = await mount(MIXED)
    const { last } = runs(heading)
    const { changes, write } = recorder()
    await editTextInPlace(container, KEY, write, { at: middleOf(shown, last) })
      .opened

    caretIn(shown, heading, heading.childNodes.length)
    inputs(heading, '!')
    press(heading, 'Escape')

    await expect
      .poll(() => changes)
      .toEqual([[{ kind: 'text', value: ' two!', run: 1 }]])
  })

  it('leaves a composition the browser will not cancel to the browser, splicing none of it', async () => {
    const { container, shown, heading } = await mount(MIXED)
    const { last } = runs(heading)
    await editTextInPlace(container, KEY, recorder().write, {
      at: middleOf(shown, last),
    }).opened

    caretIn(shown, last, last.length)
    inputs(heading, 'か', {
      inputType: 'insertCompositionText',
      cancelable: false,
    })

    expect(last.data).toBe(' two')
  })

  it('puts back a sibling run a composition wrote into, writing only the run', async () => {
    const { container, iframe, shown, heading } = await mount(MIXED)
    const { first, last } = runs(heading)
    const { changes, write } = recorder()
    await editTextInPlace(container, KEY, write, { at: middleOf(shown, last) })
      .opened

    // What the browser writes natively for a composition left at the first run.
    first.data = 'Oneか'
    heading.insertBefore(shown.createTextNode('stray'), heading.firstChild)
    press(heading, 'Escape')
    await settled(iframe)

    expect([...heading.childNodes].map((child) => child.textContent)).toEqual([
      'One ',
      'x',
      ' two',
    ])
    expect(changes).toEqual([])
  })

  it('puts the run back where it was when a composition detached it', async () => {
    const { container, iframe, shown, heading } = await mount(MIXED)
    const { last } = runs(heading)
    const edit = editTextInPlace(container, KEY, recorder().write, {
      at: middleOf(shown, last),
    })
    await edit.opened

    last.remove()
    edit.cancel()
    await settled(iframe)

    expect(heading.lastChild).toBe(last)
    expect(last.data).toBe(' two')
  })

  it('inserts nothing when the caret has left the run for the child', async () => {
    const { container, iframe, shown, heading } = await mount(MIXED)
    const { code, last } = runs(heading)
    const { changes, write } = recorder()
    await editTextInPlace(container, KEY, write, { at: middleOf(shown, last) })
      .opened

    caretIn(shown, code.firstChild ?? code, 1)
    inputs(heading, 'z')
    press(heading, 'Escape')
    await settled(iframe)

    expect(code.textContent).toBe('x')
    expect(last.data).toBe(' two')
    expect(changes).toEqual([])
  })

  it('adds no line on Enter in an element that collapses its breaks, and pastes a break as a space', async () => {
    const { container, shown, heading } = await mount(MIXED)
    const { last } = runs(heading)
    const { changes, write } = recorder()
    await editTextInPlace(container, KEY, write, { at: middleOf(shown, last) })
      .opened

    caretIn(shown, last, last.length)
    press(heading, 'Enter')
    paste(heading, 'a\r\nb')
    press(heading, 'Escape')

    await expect
      .poll(() => changes)
      .toEqual([[{ kind: 'text', value: ' twoa b', run: 1 }]])
  })

  it('keeps the space beside the child while collapsing the rest, writing nothing unchanged', async () => {
    const { container, iframe, shown, heading } = await mount(
      '<h1>One \n  <code>x</code> two</h1>',
    )
    const { first } = runs(heading)
    const { changes, write } = recorder()
    await editTextInPlace(container, KEY, write, { at: middleOf(shown, first) })
      .opened

    expect(first.data).toBe('One ')
    press(heading, 'Escape')
    await settled(iframe)

    expect(changes).toEqual([])
    expect(first.data).toBe('One \n  ')
  })

  it('opens nothing for a point on the child', async () => {
    const { container, shown, heading } = await mount(MIXED)
    const { code } = runs(heading)

    const opened = await editTextInPlace(container, KEY, recorder().write, {
      at: middleOf(shown, code),
    }).opened

    expect(opened).toBe(false)
    expect(heading.hasAttribute('contenteditable')).toBe(false)
  })

  it('puts the old run back when the write is refused', async () => {
    const { container, shown, heading } = await mount(MIXED)
    const { last } = runs(heading)
    await editTextInPlace(container, KEY, recorder(false).write, {
      at: middleOf(shown, last),
    }).opened

    caretIn(shown, last, last.length)
    inputs(heading, '!')
    press(heading, 'Escape')

    await expect.poll(() => last.data).toBe(' two')
  })

  describe("each child's own contenteditable", () => {
    const STATED =
      '<h1>One <code contenteditable="true">x</code> two <em>y</em></h1>'

    async function openStated() {
      const mounted = await mount(STATED)
      const code = mounted.heading.querySelector('code')
      const em = mounted.heading.querySelector('em')
      const two = mounted.heading.childNodes[2]
      if (!code || !em || !two)
        throw new Error('The heading holds no children.')
      const { changes, write } = recorder()
      const edit = editTextInPlace(mounted.container, KEY, write, {
        at: middleOf(mounted.shown, two),
      })
      await edit.opened
      return { ...mounted, code, em, two, edit, changes }
    }

    it('comes back once the edit commits', async () => {
      const { heading, shown, code, em, two, changes } = await openStated()

      caretIn(shown, two, 1)
      inputs(heading, '!')
      press(heading, 'Escape')

      await expect.poll(() => changes).toHaveLength(1)
      expect(code.getAttribute('contenteditable')).toBe('true')
      expect(em.hasAttribute('contenteditable')).toBe(false)
    })

    it('comes back once the edit is cancelled', async () => {
      const { iframe, code, em, edit } = await openStated()

      edit.cancel()
      await settled(iframe)

      expect(code.getAttribute('contenteditable')).toBe('true')
      expect(em.hasAttribute('contenteditable')).toBe(false)
    })

    it('comes back once the frame unloads', async () => {
      const { iframe, code, em } = await openStated()
      const shown = iframe.contentWindow

      shown?.dispatchEvent(new PageTransitionEvent('pagehide'))

      expect(code.getAttribute('contenteditable')).toBe('true')
      expect(em.hasAttribute('contenteditable')).toBe(false)
    })
  })
})

describe('editTextWhenShown', () => {
  it('opens once the reload brings the bytes the key names', async () => {
    const { container, iframe } = await mount()
    const key = { ...KEY, hash: NEXT }
    const selection = createSelectionStore()
    selectElement(selection, 'studio/home', key)
    editTextWhenShown(container, key, recorder().write, selection, () => {})

    await show(iframe, source('<h1>Text</h1>', NEXT))

    await expect
      .poll(() =>
        iframe.contentDocument
          ?.querySelector('h1')
          ?.getAttribute('contenteditable'),
      )
      .toBe('plaintext-only')
  })

  it('stops waiting once another element is selected', async () => {
    const { container, iframe } = await mount()
    const key = { ...KEY, hash: NEXT }
    const selection = createSelectionStore()
    selectElement(selection, 'studio/home', key)
    editTextWhenShown(container, key, recorder().write, selection, () => {})

    selectElement(selection, 'studio/home', { ...key, index: 2 })
    await show(iframe, source('<h1>Text</h1>', NEXT))
    await settled(iframe)

    expect(
      iframe.contentDocument
        ?.querySelector('h1')
        ?.hasAttribute('contenteditable'),
    ).toBe(false)
  })

  it('removes the text once, letting the flag go, when another element is selected before it opens', async () => {
    const { container } = await mount()
    const key = { ...KEY, hash: NEXT }
    const selection = createSelectionStore()
    selectElement(selection, 'studio/home', key)
    let removed = 0
    editTextWhenShown(container, key, recorder().write, selection, () => {
      removed += 1
    })

    selectElement(selection, 'studio/home', { ...key, index: 2 })
    selectElement(selection, 'studio/home', { ...key, index: 4 })

    expect(removed).toBe(1)
    expect(newTextStore.getState().key).toBeNull()
  })
})

describe('editTextWhenShown on a placed Text', () => {
  /** Places an empty heading under the next hash, open for typing once shown. */
  async function placed() {
    const mounted = await mount()
    const key = { ...KEY, hash: NEXT }
    const selection = createSelectionStore()
    selectElement(selection, 'studio/home', key)
    const { changes, write } = recorder()
    const leaving: boolean[] = []
    const edit = editTextWhenShown(
      mounted.container,
      key,
      write,
      selection,
      (mark) => {
        leaving.push(mark)
      },
    )
    await show(mounted.iframe, source('<h1></h1>', NEXT))
    const heading = mounted.iframe.contentDocument?.querySelector('h1')
    if (!heading) throw new Error('The frame shows no heading.')
    await expect.poll(() => edit.isOpen()).toBe(true)
    return {
      ...mounted,
      key,
      heading,
      edit,
      changes,
      leaving,
      removed: () => leaving.length,
    }
  }

  it('opens it empty, flagged as the new text while open', async () => {
    const { key, heading } = await placed()

    expect(heading.getAttribute('contenteditable')).toBe('plaintext-only')
    expect(newTextStore.getState().key).toEqual(key)
  })

  it('removes it once, letting the flag go, when it ends with nothing typed', async () => {
    const { heading, edit, changes, removed } = await placed()

    press(heading, 'Escape')
    await expect.poll(() => edit.isOpen()).toBe(false)

    await expect.poll(removed).toBe(1)
    expect(changes).toEqual([])
    expect(newTextStore.getState().key).toBeNull()
  })

  it('removes it when it ends holding white space alone', async () => {
    const { heading, changes, removed } = await placed()

    heading.textContent = '   '
    press(heading, 'Escape')

    await expect.poll(removed).toBe(1)
    expect(changes).toEqual([])
  })

  it('writes the typed text and keeps it, letting the flag go', async () => {
    const { heading, changes, removed } = await placed()

    heading.textContent = 'Hello'
    press(heading, 'Escape')

    await expect
      .poll(() => changes)
      .toEqual([[{ kind: 'text', value: 'Hello' }]])
    expect(removed()).toBe(0)
    expect(newTextStore.getState().key).toBeNull()
  })

  it('removes it once when cancelled with nothing written', async () => {
    const { iframe, edit, removed } = await placed()

    edit.cancel()
    edit.cancel()
    await settled(iframe)

    expect(removed()).toBe(1)
    expect(newTextStore.getState().key).toBeNull()
  })

  it('removes it once, marked as leaving, when the board page hides with nothing typed', async () => {
    const { heading, edit, leaving } = await placed()

    window.dispatchEvent(new PageTransitionEvent('pagehide'))
    window.dispatchEvent(new PageTransitionEvent('pagehide'))

    expect(leaving).toEqual([true])
    expect(edit.isOpen()).toBe(false)
    expect(newTextStore.getState().key).toBeNull()
    await expect.poll(() => heading.hasAttribute('contenteditable')).toBe(false)
  })

  it('removes nothing when the board page hides after the text is written', async () => {
    const { heading, changes, removed } = await placed()
    heading.textContent = 'Hello'
    press(heading, 'Escape')
    await expect.poll(() => changes).toHaveLength(1)

    window.dispatchEvent(new PageTransitionEvent('pagehide'))

    expect(removed()).toBe(0)
  })

  it('marks an Esc with nothing typed as not leaving', async () => {
    const { heading, leaving } = await placed()

    press(heading, 'Escape')

    await expect.poll(() => leaving).toEqual([false])
  })
})

describe('caretAt on an open edit', () => {
  /** The frame-local point just inside the left edge of the character at `offset`. */
  function pointAt(shown: Document, node: Node, offset: number) {
    const range = shown.createRange()
    range.setStart(node, offset)
    range.setEnd(node, offset + 1)
    const { left, top, height } = range.getBoundingClientRect()
    return { x: left + 1, y: top + height / 2 }
  }

  it('moves the caret to the point and keeps the edit open', async () => {
    const { container, shown, heading } = await mount('<h1>Hello world</h1>')
    const edit = editTextInPlace(container, KEY, recorder().write)
    await edit.opened
    const text = heading.firstChild
    if (!text) throw new Error('The heading holds no text.')

    const placed = await edit.caretAt(pointAt(shown, text, 6))

    expect(placed).toBe(true)
    expect(shown.getSelection()?.isCollapsed).toBe(true)
    expect(shown.getSelection()?.anchorOffset).toBe(6)
    expect(edit.isOpen()).toBe(true)
    expect(heading.hasAttribute(EDITING)).toBe(true)
  })

  it('places no caret for a point outside the text, keeping the selection', async () => {
    const { container, iframe, shown } = await mount('<h1>Hello world</h1>')
    const edit = editTextInPlace(container, KEY, recorder().write)
    await edit.opened

    const placed = await edit.caretAt({ x: 4, y: iframe.clientHeight - 4 })

    expect(placed).toBe(false)
    expect(shown.getSelection()?.toString()).toBe('Hello world')
  })

  it('reads closed and places nothing once the edit ends', async () => {
    const { container, heading } = await mount('<h1>Hello world</h1>')
    const edit = editTextInPlace(container, KEY, recorder().write)
    await edit.opened

    press(heading, 'Escape')
    await expect.poll(() => edit.isOpen()).toBe(false)

    expect(await edit.caretAt({ x: 1, y: 1 })).toBe(false)
  })

  it('places no caret on a child beside the run being edited', async () => {
    const { container, shown, heading } = await mount(
      '<h1>One <code>xyz</code> two</h1>',
    )
    const [, code, last] = heading.childNodes
    if (!code?.firstChild || !last) throw new Error('No run beside a code.')
    const edit = editTextInPlace(container, KEY, recorder().write, {
      at: pointAt(shown, last, 2),
    })
    await edit.opened

    const placed = await edit.caretAt(pointAt(shown, code.firstChild, 1))

    expect(placed).toBe(false)
    expect(shown.getSelection()?.toString()).toBe(' two')
  })

  it('moves the caret within the run being edited', async () => {
    const { container, shown, heading } = await mount(
      '<h1>One <code>xyz</code> two</h1>',
    )
    const [, , last] = heading.childNodes
    if (!last) throw new Error('No run beside a code.')
    const edit = editTextInPlace(container, KEY, recorder().write, {
      at: pointAt(shown, last, 2),
    })
    await edit.opened

    const placed = await edit.caretAt(pointAt(shown, last, 3))

    expect(placed).toBe(true)
    expect(shown.getSelection()?.anchorNode).toBe(last)
    expect(shown.getSelection()?.anchorOffset).toBe(3)
  })
})

describe('pressInEdit', () => {
  const FRAMES = [
    frameOf('hero', { box: { x: 100, y: 50, width: 400, height: 300 } }),
  ]

  /** A layer drawing the selected element's outline at a board box. */
  function outlined(box: { x: number; y: number; w: number; h: number }) {
    const layer = document.createElement('div')
    const outline = document.createElement('div')
    outline.dataset.elementSelection = ''
    Object.assign(outline.style, {
      left: `${box.x}px`,
      top: `${box.y}px`,
      width: `${box.w}px`,
      height: `${box.h}px`,
    })
    layer.append(outline)
    return layer
  }

  it('answers the frame point for a board point inside the outline', () => {
    const layer = outlined({ x: 140, y: 90, w: 100, h: 30 })

    expect(pressInEdit(layer, FRAMES, KEY, { x: 150, y: 100 })).toEqual({
      x: 50,
      y: 50,
    })
  })

  it('answers null for a board point past the outline', () => {
    const layer = outlined({ x: 140, y: 90, w: 100, h: 30 })

    expect(pressInEdit(layer, FRAMES, KEY, { x: 150, y: 121 })).toBeNull()
  })

  it('answers null while no outline draws', () => {
    expect(
      pressInEdit(document.createElement('div'), FRAMES, KEY, { x: 0, y: 0 }),
    ).toBeNull()
  })
})

describe('overElement', () => {
  const HERO = frameOf('hero', {
    box: { x: 100, y: 50, width: 400, height: 300 },
  })

  /** Whether a double-click in the selected heading edits it, measured as the overlay measures the selection. */
  async function overHeading(body: string): Promise<boolean> {
    const shown = await mount(body)
    const { unmount } = renderHook(() => useMeasures(shown.container, [KEY]))
    await expect.poll(() => heldMeasures([KEY])).not.toBeNull()
    const over = await overElement(shown.container, [HERO], KEY, {
      x: HERO.box.x + 12,
      y: HERO.box.y + 30,
    })
    unmount()
    return over
  }

  it('edits the selected element under the point', async () => {
    expect(await overHeading('<h1 style="height:80px">Old</h1>')).toBe(true)
  })

  it('opens no edit on a locked one', async () => {
    expect(
      await overHeading('<h1 data-locked="" style="height:80px">Old</h1>'),
    ).toBe(false)
  })
})
