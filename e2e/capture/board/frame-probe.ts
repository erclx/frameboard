import type { Page } from '@playwright/test'

/** An element's box inside its frame, with what a capture script reads off it. */
export interface ProbedElement {
  left: number
  top: number
  bottom: number
  width: number
  height: number
  /** Whether the frame has the element open for typing. */
  editing: boolean
  /** The element's text, which a typing capture waits to see land. */
  text: string
  /** The box of the element's last child node, such as the words after a `code`. */
  lastRun: { left: number; top: number; width: number; height: number } | null
}

/** What a frame last reported of itself. */
export interface FrameReport {
  /** The frame's viewport width, which a board box divides by for its zoom. */
  width: number
  /** Whether every video in the page has decoded a frame. */
  videosDecoded: boolean
  /** The page's first running animation, null while it runs none. */
  animation: { playState: string; currentTime: number | null } | null
  /** Each probed selector's first match, null where nothing matches. */
  elements: Record<string, ProbedElement | null>
}

/** The board page's reader, installed by `probeFrames`. */
export interface ProbeWindow {
  frameReport: (iframe: HTMLIFrameElement) => FrameReport | null
  frameAct: (iframe: HTMLIFrameElement, act: FrameAct) => void
}

/** What a capture script asks a frame to do inside its own page. */
export interface FrameAct {
  /** Puts the caret at the end of `selector`, presses Enter, then pastes `text`. */
  type: string
  text: string
}

const PROBE = 'capture-probe'
const ACT = 'capture-act'

/**
 * Lets a board capture script read and drive the pages in its frames, which
 * sit on their own port and hide their documents. Each frame reports the
 * `selectors` it holds on every animation frame, for `frames` frames, and
 * the board page reads the latest report through `window.frameReport`.
 */
export async function probeFrames(
  page: Page,
  selectors: string[],
  frames: number,
): Promise<void> {
  await page.addInitScript(
    ({ selectors, frames, PROBE, ACT }) => {
      if (window === window.top) {
        const reports = new Map<MessageEventSource, Record<string, unknown>>()
        addEventListener('message', (event) => {
          const data = event.data as { tag?: unknown; report?: unknown }
          if (data?.tag !== PROBE || !event.source) return
          const report = data.report as { elements: object }
          const held = reports.get(event.source) as
            | { elements: object }
            | undefined
          // Two cases can probe one frame, so their elements gather.
          reports.set(event.source, {
            ...report,
            elements: { ...held?.elements, ...report.elements },
          })
        })
        Object.assign(window, {
          frameReport: (iframe: HTMLIFrameElement) =>
            (iframe.contentWindow && reports.get(iframe.contentWindow)) ?? null,
          frameAct: (iframe: HTMLIFrameElement, act: unknown) =>
            iframe.contentWindow?.postMessage({ tag: ACT, act }, '*'),
        })
        return
      }
      const box = (rect: DOMRect) => ({
        left: rect.left,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      })
      const lastRun = (element: Element) => {
        const last = element.lastChild
        if (!last) return null
        const range = document.createRange()
        range.selectNodeContents(last)
        return box(range.getBoundingClientRect())
      }
      addEventListener('message', (event) => {
        const data = event.data as {
          tag?: unknown
          act?: { type: string; text: string }
        }
        if (event.source !== parent || data?.tag !== ACT || !data.act) return
        const element = document.querySelector<HTMLElement>(data.act.type)
        if (!element) return
        const end = document.createRange()
        end.selectNodeContents(element)
        end.collapse(false)
        getSelection()?.removeAllRanges()
        getSelection()?.addRange(end)
        element.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
        )
        const pasted = new DataTransfer()
        pasted.setData('text/plain', data.act.text)
        element.dispatchEvent(
          new ClipboardEvent('paste', { clipboardData: pasted, bubbles: true }),
        )
      })
      let left = frames
      const report = () => {
        const animation = document.getAnimations()[0]
        parent.postMessage(
          {
            tag: PROBE,
            report: {
              width: innerWidth,
              videosDecoded: [...document.querySelectorAll('video')].every(
                (video) => video.readyState >= 2,
              ),
              animation: animation
                ? {
                    playState: animation.playState,
                    currentTime:
                      animation.currentTime === null
                        ? null
                        : Number(animation.currentTime),
                  }
                : null,
              elements: Object.fromEntries(
                selectors.map((selector) => {
                  const element = document.querySelector(selector)
                  return [
                    selector,
                    element && {
                      ...box(element.getBoundingClientRect()),
                      editing: element.hasAttribute('data-frameboard-editing'),
                      text: element.textContent ?? '',
                      lastRun: lastRun(element),
                    },
                  ]
                }),
              ),
            },
          },
          '*',
        )
        if (--left > 0) requestAnimationFrame(report)
      }
      document.addEventListener('DOMContentLoaded', report)
    },
    { selectors, frames, PROBE, ACT },
  )
}
