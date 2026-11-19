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
 * The iframe page's content height at its width, null when sized off the
 * viewport, read as the server's fit does at 1px tall and at `height`. The
 * two reads cross the bridge as two tasks, so the iframe hides between them
 * rather than paint its collapsed page. A newer read takes over, answering
 * null for the older, and a page that never announced itself is not read.
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
