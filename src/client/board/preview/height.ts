import { request } from '../bridge/channel'
import { shownHashOf } from '../bridge/shown'

/** The read an iframe is under, and the height and visibility it stood at before the first of a run of reads. */
interface Reading {
  run: number
  height: string
  visibility: string
}

const readings = new WeakMap<HTMLIFrameElement, Reading>()
let runs = 0

/**
 * The page's content height at its width, null when sized off the viewport or
 * superseded. The 1px and `height` reads are two tasks, so the iframe hides between.
 */
export async function measureHeight(
  iframe: HTMLIFrameElement,
  height: number,
): Promise<number | null> {
  if (shownHashOf(iframe) === null) return null
  const run = ++runs
  const before = readings.get(iframe) ?? {
    height: iframe.style.height,
    visibility: iframe.style.visibility,
  }
  readings.set(iframe, { ...before, run })
  const current = () => readings.get(iframe)?.run === run
  iframe.style.visibility = 'hidden'
  iframe.style.height = '1px'
  const short = await request(iframe, 'content-height', {})
  if (!current()) return null
  iframe.style.height = `${height}px`
  const tall = await request(iframe, 'content-height', {})
  if (!current()) return null
  readings.delete(iframe)
  iframe.style.height = before.height
  iframe.style.visibility = before.visibility
  return short !== null && short === tall ? short : null
}
