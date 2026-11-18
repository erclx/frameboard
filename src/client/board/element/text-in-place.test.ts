import { afterEach, describe, expect, it } from 'vitest'

import { request } from '../bridge/channel'
import type { ElementChange } from '../inspector/element/write'
import { createSelectionStore, selectElement } from '../selection'
import { editTextInPlace, editTextWhenShown } from './text-in-place'

const HASH = 'c'.repeat(64)
const NEXT = 'd'.repeat(64)
const FRAME = 'studio/home/hero'

// Indices: html 0, head 1, the injected style and script are skipped, body 2, h1 3.
const KEY = { frame: FRAME, index: 3, hash: HASH }

let container: HTMLDivElement | undefined

afterEach(() => {
  container?.remove()
  container = undefined
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

describe('editTextWhenShown', () => {
  it('opens once the reload brings the bytes the key names', async () => {
    const { container, iframe } = await mount()
    const key = { ...KEY, hash: NEXT }
    const selection = createSelectionStore()
    selectElement(selection, 'studio/home', key)
    editTextWhenShown(container, key, recorder().write, selection)

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
    editTextWhenShown(container, key, recorder().write, selection)

    selectElement(selection, 'studio/home', { ...key, index: 2 })
    await show(iframe, source('<h1>Text</h1>', NEXT))
    await settled(iframe)

    expect(
      iframe.contentDocument
        ?.querySelector('h1')
        ?.hasAttribute('contenteditable'),
    ).toBe(false)
  })
})
