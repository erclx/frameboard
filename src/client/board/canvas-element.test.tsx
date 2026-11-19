import '../styles.css'

import { act, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { EDITING } from '@/shared/frame-bridge/messages'
import type { PageRecord } from '@/shared/records/list'
import { frameOf, pageOf } from '@/test/board'

import { request } from './bridge/channel'
import { Canvas } from './canvas'
import { trees } from './element/tree'
import { clear, selectionStore } from './selection'

function renderCanvas(content: PageRecord) {
  return render(
    <div style={{ width: 800, height: 600 }}>
      <Canvas page={content} reloads={{}} />
    </div>,
  )
}

describe('double-clicking an element in a frame', () => {
  const CARD = frameOf('card', { box: { x: 0, y: 0, width: 400, height: 300 } })
  const HASH = 'e'.repeat(64)
  // Indices: html 0, head 1, the injected style is skipped, body 2, div 3, h1 4.
  const BODY = '<div style="padding:40px"><h1 style="margin:0">Hello</h1></div>'

  /** The card frame drawn on the canvas, showing BODY at HASH with its tree held. */
  async function renderCard() {
    trees.store.setState({
      byRef: {
        [CARD.ref]: {
          status: 'ready',
          version: 0,
          tree: {
            ref: CARD.ref,
            hash: HASH,
            elements: [
              {
                index: 3,
                parent: null,
                tag: 'div',
                name: 'Card',
                textOnly: false,
                layout: 'block',
                round: false,
                placed: false,
              },
              {
                index: 4,
                parent: 3,
                tag: 'h1',
                name: 'Hello',
                textOnly: true,
                layout: 'block',
                round: false,
                placed: false,
              },
            ],
          },
        },
      },
    })
    const { container } = renderCanvas(pageOf([CARD]))
    const drawn = container.querySelector(`[data-frame="${CARD.ref}"]`)
    const hit = container.querySelector<HTMLElement>('[data-hit-layer]')
    if (!drawn || !hit) throw new Error('no drawn frame')
    // The frame comes live a moment after it draws, and shows BODY in place of its file.
    await expect.poll(() => drawn.querySelector('iframe')).not.toBeNull()
    const iframe = drawn.querySelector('iframe')
    if (!iframe) throw new Error('no live frame')
    iframe.srcdoc = `<!doctype html><html><head><style data-frameboard data-hash="${HASH}"></style><script data-frameboard type="module" src="/src/frame-bridge/main.ts"></script></head><body style="margin:0">${BODY}</body></html>`
    // Complete once its bridge has run, which answers the double-click.
    await expect
      .poll(
        () =>
          iframe.contentDocument?.readyState === 'complete' &&
          iframe.contentDocument.querySelector('h1'),
      )
      .toBeTruthy()
    const heading = iframe.contentDocument?.querySelector('h1')
    if (!heading) throw new Error('the frame shows no heading')
    return { drawn: drawn.getBoundingClientRect(), hit, heading }
  }

  /** A press and a release at the point, `detail` counting the clicks, as a mouse sends them. */
  function click(
    hit: HTMLElement,
    at: { clientX: number; clientY: number },
    detail: number,
    metaKey = false,
  ) {
    const event = (type: string) =>
      new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        view: window,
        detail,
        metaKey,
        ...at,
      })
    act(() => {
      hit.dispatchEvent(event('mousedown'))
      window.dispatchEvent(event('mouseup'))
      hit.dispatchEvent(event('click'))
      if (detail === 2) hit.dispatchEvent(event('dblclick'))
    })
  }

  afterEach(() => {
    act(() => {
      clear(selectionStore)
      trees.store.setState({ byRef: {} })
    })
  })

  it('opens an unselected text for typing on one double-click', async () => {
    const { drawn, hit, heading } = await renderCard()
    const scale = drawn.width / CARD.box.width
    const at = {
      clientX: drawn.left + 60 * scale,
      clientY: drawn.top + 50 * scale,
    }

    click(hit, at, 1)
    click(hit, at, 2)

    await expect.poll(() => heading.hasAttribute(EDITING)).toBe(true)
    expect(selectionStore.getState().element?.index).toBe(4)
  })

  it('only selects a container on a double-click', async () => {
    const { drawn, hit, heading } = await renderCard()
    const scale = drawn.width / CARD.box.width
    const at = {
      clientX: drawn.left + 20 * scale,
      clientY: drawn.top + 20 * scale,
    }

    click(hit, at, 1)
    click(hit, at, 2)

    await expect.poll(() => selectionStore.getState().element?.index).toBe(3)
    expect(heading.parentElement?.hasAttribute(EDITING)).toBe(false)
  })

  /** A primary press at the point, answering the event so a test reads whether it was cancelled. */
  function pressAt(hit: HTMLElement, at: { clientX: number; clientY: number }) {
    const event = new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      button: 0,
      isPrimary: true,
      ...at,
    })
    act(() => {
      hit.dispatchEvent(event)
    })
    return event
  }

  /** Opens the heading for typing by a double-click, once its outline draws. */
  async function openHeading() {
    const card = await renderCard()
    const scale = card.drawn.width / CARD.box.width
    const on = (x: number, y: number) => ({
      clientX: card.drawn.left + x * scale,
      clientY: card.drawn.top + y * scale,
    })
    click(card.hit, on(60, 50), 1)
    click(card.hit, on(60, 50), 2)
    await expect.poll(() => card.heading.hasAttribute(EDITING)).toBe(true)
    await expect
      .poll(() => document.querySelector('[data-element-selection]'))
      .not.toBeNull()
    return { ...card, on }
  }

  it('keeps the edit open and moves its caret on a press inside the text', async () => {
    const { hit, heading, on } = await openHeading()
    const text = heading.firstChild
    const shown = heading.ownerDocument
    if (!text) throw new Error('the heading holds no text')
    const range = shown.createRange()
    range.setStart(text, 2)
    range.setEnd(text, 3)
    const char = range.getBoundingClientRect()

    const press = pressAt(hit, on(char.left + 1, char.top + char.height / 2))

    expect(press.defaultPrevented).toBe(true)
    await expect.poll(() => shown.getSelection()?.isCollapsed).toBe(true)
    expect(shown.getSelection()?.anchorOffset).toBe(2)
    expect(heading.hasAttribute(EDITING)).toBe(true)
  })

  it('keeps the edit open through a double-click inside the text', async () => {
    const { hit, heading, on } = await openHeading()
    heading.textContent = 'Typed'

    pressAt(hit, on(60, 50))
    click(hit, on(60, 50), 1)
    pressAt(hit, on(60, 50))
    click(hit, on(60, 50), 2)
    // A reopen reads the box, then cancels, so two answers later it would show.
    const iframe = heading.ownerDocument.defaultView?.frameElement
    if (!(iframe instanceof HTMLIFrameElement)) throw new Error('no frame')
    await request(iframe, 'element-box', { index: 0, hash: '' })
    await request(iframe, 'element-box', { index: 0, hash: '' })

    expect(heading.hasAttribute(EDITING)).toBe(true)
    expect(heading.textContent).toBe('Typed')
    expect(selectionStore.getState().element?.index).toBe(4)
  })

  it('leaves a press outside the open text to the board', async () => {
    const { hit, on } = await openHeading()

    const press = pressAt(hit, on(20, 20))

    expect(press.defaultPrevented).toBe(false)
  })

  it('leaves a keyboard click to the board after a press inside the open text', async () => {
    const { hit, on } = await openHeading()
    pressAt(hit, on(60, 50))
    // Enter or Space on a focused button clicks with a detail of 0 and no press.
    const key = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      detail: 0,
    })

    act(() => {
      hit.dispatchEvent(key)
    })

    expect(key.defaultPrevented).toBe(false)
  })

  it('only selects a text on a Cmd-click', async () => {
    const { drawn, hit, heading } = await renderCard()
    const scale = drawn.width / CARD.box.width
    const at = {
      clientX: drawn.left + 60 * scale,
      clientY: drawn.top + 50 * scale,
    }

    click(hit, at, 1)
    click(hit, at, 1, true)

    await expect.poll(() => selectionStore.getState().element?.index).toBe(4)
    expect(heading.hasAttribute(EDITING)).toBe(false)
  })
})
