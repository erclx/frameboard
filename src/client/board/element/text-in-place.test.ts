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

/** A writer recording each change it is handed, answering `written`. */
function recorder(written = true) {
  const changes: ElementChange[] = []
  const write = async (change: ElementChange) => {
    changes.push(change)
    return written
  }
  return { changes, write }
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

  it('writes the typed text on Enter and leaves the element', async () => {
    const { shown, heading } = await mount()
    const { changes, write } = recorder()
    editTextInPlace(shown, KEY, write)

    heading.textContent = 'New'
    press(heading, 'Enter')

    expect(changes).toEqual([{ kind: 'text', value: 'New' }])
    expect(heading.hasAttribute('contenteditable')).toBe(false)
  })

  it('writes the typed text once focus leaves it', async () => {
    const { shown, heading } = await mount()
    const { changes, write } = recorder()
    editTextInPlace(shown, KEY, write)

    heading.textContent = 'New'
    heading.blur()

    expect(changes).toEqual([{ kind: 'text', value: 'New' }])
  })

  it('puts the old text back on Esc and writes nothing', async () => {
    const { shown, heading } = await mount()
    const { changes, write } = recorder()
    editTextInPlace(shown, KEY, write)

    heading.textContent = 'New'
    press(heading, 'Escape')

    expect(heading.textContent).toBe('Old')
    expect(changes).toEqual([])
  })

  it('writes a newline as a space', async () => {
    const { shown, heading } = await mount()
    const { changes, write } = recorder()
    editTextInPlace(shown, KEY, write)

    heading.textContent = 'One\nTwo'
    press(heading, 'Enter')

    expect(changes).toEqual([{ kind: 'text', value: 'One Two' }])
  })

  it('takes a pasted line break as a space', async () => {
    const { shown, heading } = await mount()
    const { changes, write } = recorder()
    editTextInPlace(shown, KEY, write)

    const data = new DataTransfer()
    data.setData('text/plain', 'One\r\nTwo')
    heading.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true }),
    )
    press(heading, 'Enter')

    expect(changes).toEqual([{ kind: 'text', value: 'One Two' }])
  })

  it('puts the old text back when the write is refused', async () => {
    const { shown, heading } = await mount()
    editTextInPlace(shown, KEY, recorder(false).write)

    heading.textContent = 'New'
    press(heading, 'Enter')
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
