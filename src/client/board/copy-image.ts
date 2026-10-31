import { writeBoard } from '@/client/live/write'
import type { Theme } from '@/shared/theme'

/** The scale every copy renders at, matching the route's default. */
const COPY_SCALE = 2

/** The longest side a browser canvas reliably draws, past which the stitch scales down. */
const MAX_CANVAS_SIDE = 16384

/**
 * Copies a frame to the clipboard as a PNG in the theme on screen. The
 * clipboard write starts at once with the image's fetch as its pending
 * value, since a browser grants the write only inside the key press's user
 * activation, which an awaited fetch would outlast.
 */
export function copyFrameImage(
  ref: string,
  theme: Theme,
  clipboard: Pick<Clipboard, 'write'> = navigator.clipboard,
): Promise<void> {
  return clipboard.write([
    new ClipboardItem({ 'image/png': fetchFrameImage(ref, theme) }),
  ])
}

/** What the server reports after putting frames on the OS clipboard. */
export interface CopiedFrames {
  copied: number
  backend: string
}

/**
 * Asks the server to put the frames on the OS clipboard as one file list,
 * which only a server holding a clipboard backend accepts, so one paste lands
 * every image.
 */
export function copyFramesToClipboard(
  refs: readonly string[],
  theme: Theme,
  send: typeof fetch = fetch,
): Promise<CopiedFrames> {
  return writeBoard<CopiedFrames>(
    '/api/frames/clipboard',
    { refs, theme },
    'POST',
    send,
  )
}

interface Box {
  x: number
  y: number
  width: number
  height: number
}

/** Where each frame lands on one stitched image, in device pixels. */
export interface StitchLayout {
  width: number
  height: number
  places: Box[]
}

/**
 * The frames' canvas boxes laid onto one image at `scale`, keeping the gaps
 * between them, scaled down so neither side passes what a canvas draws.
 */
export function stitchLayout(
  boxes: readonly Box[],
  scale = COPY_SCALE,
): StitchLayout {
  const left = Math.min(...boxes.map((box) => box.x))
  const top = Math.min(...boxes.map((box) => box.y))
  const right = Math.max(...boxes.map((box) => box.x + box.width))
  const bottom = Math.max(...boxes.map((box) => box.y + box.height))
  const fit = Math.min(
    scale,
    MAX_CANVAS_SIDE / (right - left),
    MAX_CANVAS_SIDE / (bottom - top),
  )
  const px = (value: number) => Math.round(value * fit)
  return {
    width: px(right - left),
    height: px(bottom - top),
    places: boxes.map((box) => ({
      x: px(box.x - left),
      y: px(box.y - top),
      width: px(box.width),
      height: px(box.height),
    })),
  }
}

/**
 * Copies the frames as one PNG laid out as on the canvas, over `background`,
 * for a system the server holds no clipboard backend for. The write starts
 * inside the key press with the composition as its pending value, as
 * `copyFrameImage` does.
 */
export function copyStitchedImage(
  frames: readonly { ref: string; box: Box }[],
  theme: Theme,
  background: string,
  clipboard: Pick<Clipboard, 'write'> = navigator.clipboard,
): Promise<void> {
  const png = stitch(frames, theme, background)
  return clipboard.write([new ClipboardItem({ 'image/png': png })])
}

async function stitch(
  frames: readonly { ref: string; box: Box }[],
  theme: Theme,
  background: string,
): Promise<Blob> {
  const layout = stitchLayout(frames.map((frame) => frame.box))
  const images = await Promise.all(
    frames.map(async (frame) =>
      createImageBitmap(await fetchFrameImage(frame.ref, theme)),
    ),
  )
  const canvas = new OffscreenCanvas(layout.width, layout.height)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('This browser has no 2D canvas to compose on.')
  context.fillStyle = background
  context.fillRect(0, 0, layout.width, layout.height)
  images.forEach((image, index) => {
    const place = layout.places[index]
    if (place) {
      context.drawImage(image, place.x, place.y, place.width, place.height)
    }
    image.close()
  })
  return canvas.convertToBlob({ type: 'image/png' })
}

async function fetchFrameImage(ref: string, theme: Theme): Promise<Blob> {
  const query = new URLSearchParams({ ref, theme })
  const response = await fetch(`/api/frames/png?${query}`)
  if (!response.ok) throw new Error(`The board answered ${response.status}.`)
  return response.blob()
}

let backend: string | null = null

/**
 * The clipboard backend `/api/health` last reported, null until it arrives or
 * where the server has none. The copy path is chosen inside a key press that
 * cannot wait on a request, so `readClipboardBackend` asks ahead.
 */
export function clipboardBackend(): string | null {
  return backend
}

let reads = 0

/**
 * Reads the clipboard backend off `/api/health`, leaving none on a failed
 * read. Only the latest read writes, so an older one answering late never
 * overwrites a newer reading.
 */
export async function readClipboardBackend(
  send: typeof fetch = fetch,
): Promise<void> {
  const read = ++reads
  let next: string | null = null
  try {
    const response = await send('/api/health')
    const health = (await response.json()) as { clipboard?: unknown }
    if (typeof health.clipboard === 'string') next = health.clipboard
  } catch {
    // A failed read leaves no backend, so a copy stitches.
  }
  if (read === reads) backend = next
}
