import { afterEach, describe, expect, it } from 'vitest'

import type { ElementChange } from '../inspector/element/write'
import { createSelectionStore, selectElement } from '../selection'
import { editTextInPlace, editTextWhenShown } from './text-in-place'

const HASH = 'c'.repeat(64)
const NEXT = 'd'.repeat(64)
const FRAME = 'studio/home/hero'

// Indices: html 0, head 1, the injected style is skipped, body 2, h1 3.
const KEY = { frame: FRAME, index: 3, hash: HASH }

let container: HTMLDivElement | undefined

afterEach(() => {
  container?.remove()
  container = undefined
})

function source(body: string, hash = HASH): string {
  return `<!doctype html><html><head><style data-frameboard data-hash="${hash}"></style></head><body>${body}</body></html>`
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
    const { shown, heading } = await mount()

    editTextInPlace(shown, KEY, recorder().write)

    expect(heading.getAttribute('contenteditable')).toBe('plaintext-only')
    expect(shown.activeElement).toBe(heading)
    expect(shown.getSelection()?.toString()).toBe('Old')
  })

  it('adds a line on Enter and keeps the edit open', async () => {
    const { shown, heading } = await mount()
    const { changes, write } = recorder()
    editTextInPlace(shown, KEY, write)

    caretAtEnd(shown, heading)
    press(heading, 'Enter')

    expect(heading.textContent).toMatch(/^Old\n/)
    expect(heading.getAttribute('contenteditable')).toBe('plaintext-only')
    expect(changes).toEqual([])
  })

  it('adds a line on Shift+Enter too', async () => {
    const { shown, heading } = await mount()
    editTextInPlace(shown, KEY, recorder().write)

    caretAtEnd(shown, heading)
    press(heading, 'Enter', true)

    expect(heading.textContent).toMatch(/^Old\n/)
  })

  it('writes nothing for a line added at the end and left empty', async () => {
    const { shown, heading } = await mount()
    const { changes, write } = recorder()
    editTextInPlace(shown, KEY, write)

    caretAtEnd(shown, heading)
    press(heading, 'Enter')
    press(heading, 'Escape')

    expect(changes).toEqual([])
    expect(heading.textContent).toBe('Old')
  })

  it('writes the typed text on Esc and leaves the element', async () => {
    const { shown, heading } = await mount()
    const { changes, write } = recorder()
    editTextInPlace(shown, KEY, write)

    heading.textContent = 'New'
    press(heading, 'Escape')

    expect(changes).toEqual([[{ kind: 'text', value: 'New' }]])
    expect(heading.hasAttribute('contenteditable')).toBe(false)
  })

  it('keeps Esc from reaching the frame past the edit', async () => {
    const { shown, heading } = await mount()
    editTextInPlace(shown, KEY, recorder().write)
    let reached = false
    shown.addEventListener('keydown', () => {
      reached = true
    })

    press(heading, 'Escape')

    expect(reached).toBe(false)
  })

  it('writes the typed text once focus leaves it', async () => {
    const { shown, heading } = await mount()
    const { changes, write } = recorder()
    editTextInPlace(shown, KEY, write)

    heading.textContent = 'New'
    heading.blur()

    expect(changes).toEqual([[{ kind: 'text', value: 'New' }]])
  })

  it('writes nothing when the text is unchanged', async () => {
    const { shown, heading } = await mount()
    const { changes, write } = recorder()
    editTextInPlace(shown, KEY, write)

    press(heading, 'Escape')

    expect(changes).toEqual([])
  })

  it('writes a typed line with pre-line beside it, as one write', async () => {
    const { shown, heading } = await mount()
    const { changes, write } = recorder()
    editTextInPlace(shown, KEY, write)

    caretAtEnd(shown, heading)
    press(heading, 'Enter')
    paste(heading, 'Two')
    press(heading, 'Escape')

    expect(changes).toEqual([
      [
        { kind: 'text', value: 'Old\nTwo' },
        { kind: 'style', property: 'white-space', value: 'pre-line' },
      ],
    ])
  })

  it('writes no white-space on an element that already keeps its breaks', async () => {
    const { shown, heading } = await mount(
      '<h1 style="white-space: pre-wrap">Old</h1>',
    )
    const { changes, write } = recorder()
    editTextInPlace(shown, KEY, write)

    heading.textContent = 'One\nTwo'
    press(heading, 'Escape')

    expect(changes).toEqual([[{ kind: 'text', value: 'One\nTwo' }]])
  })

  it('writes nothing for a kept-breaks text left as it was, whose source ends on a break', async () => {
    const { shown, heading } = await mount(
      '<h1 style="white-space: pre-wrap">Old\n</h1>',
    )
    const { changes, write } = recorder()
    editTextInPlace(shown, KEY, write)

    press(heading, 'Escape')

    expect(changes).toEqual([])
    expect(heading.textContent).toBe('Old\n')
  })

  it('opens on the text as shown, so the newlines wrapping its source stay spaces', async () => {
    const { shown, heading } = await mount(
      '<h1>\n      Old\n      text\n    </h1>',
    )
    const { changes, write } = recorder()
    editTextInPlace(shown, KEY, write)

    expect(heading.textContent).toBe('Old text')
    heading.textContent = 'New text'
    press(heading, 'Escape')

    expect(changes).toEqual([[{ kind: 'text', value: 'New text' }]])
  })

  it('keeps a pasted line break as one newline', async () => {
    const { shown, heading } = await mount()
    const { changes, write } = recorder()
    editTextInPlace(shown, KEY, write)

    paste(heading, 'One\r\nTwo')
    press(heading, 'Escape')

    expect(changes).toEqual([
      [
        { kind: 'text', value: 'One\nTwo' },
        { kind: 'style', property: 'white-space', value: 'pre-line' },
      ],
    ])
  })

  it('puts the old text back when the write is refused', async () => {
    const { shown, heading } = await mount()
    editTextInPlace(shown, KEY, recorder(false).write)

    heading.textContent = 'New'
    press(heading, 'Escape')
    await Promise.resolve()

    expect(heading.textContent).toBe('Old')
  })

  it('ends with nothing sent once the frame reloads', async () => {
    const { iframe, shown, heading } = await mount()
    const { changes, write } = recorder()
    editTextInPlace(shown, KEY, write)
    heading.textContent = 'New'

    await show(iframe, source('<h1>Agent</h1>', NEXT))

    expect(changes).toEqual([])
  })

  it('refuses a frame showing other bytes than the key names', async () => {
    const { shown } = await mount()

    expect(
      editTextInPlace(shown, { ...KEY, hash: NEXT }, recorder().write),
    ).toBeNull()
  })

  it('refuses an empty box, as a placed shape is', async () => {
    const { shown, heading } = await mount('<h1></h1>')

    expect(editTextInPlace(shown, KEY, recorder().write)).toBeNull()
    expect(heading.hasAttribute('contenteditable')).toBe(false)
  })

  it('refuses an element holding more than text', async () => {
    const { shown } = await mount('<h1>Hi <em>there</em></h1>')

    expect(editTextInPlace(shown, KEY, recorder().write)).toBeNull()
  })
})

describe('editTextWhenShown', () => {
  it('opens once the reload brings the bytes the key names', async () => {
    const { container, iframe } = await mount()
    const key = { ...KEY, hash: NEXT }
    const selection = createSelectionStore()
    selectElement(selection, 'studio/home', key)
    editTextWhenShown(container, key, recorder().write, selection)

    await show(iframe, source('<h1>Text</h1>', NEXT))

    expect(
      iframe.contentDocument
        ?.querySelector('h1')
        ?.getAttribute('contenteditable'),
    ).toBe('plaintext-only')
  })

  it('stops waiting once another element is selected', async () => {
    const { container, iframe } = await mount()
    const key = { ...KEY, hash: NEXT }
    const selection = createSelectionStore()
    selectElement(selection, 'studio/home', key)
    editTextWhenShown(container, key, recorder().write, selection)

    selectElement(selection, 'studio/home', { ...key, index: 2 })
    await show(iframe, source('<h1>Text</h1>', NEXT))

    expect(
      iframe.contentDocument
        ?.querySelector('h1')
        ?.hasAttribute('contenteditable'),
    ).toBe(false)
  })
})
