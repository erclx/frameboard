import type { AssetKind } from '@/shared/asset-kinds'

/** A placed file's box in CSS pixels. */
export interface AssetSize {
  width: number
  height: number
}

/** What a file with no intrinsic size lands at, a 16 by 9 box. */
export const FALLBACK_SIZE: AssetSize = { width: 240, height: 135 }

/**
 * The box an audio file lands at, measured from nothing. The insert writes
 * the width alone, so the browser's player sets its own height, and the
 * height here only gives the route a side it takes.
 */
export const AUDIO_SIZE: AssetSize = { width: 300, height: 54 }

/** How long a video's metadata may take before the fallback stands in. */
const METADATA_MS = 3000

/** The longest side the insert route takes, in CSS pixels. */
const MAX_SIDE = 10_000

/**
 * A placed file's box, its natural size or the fallback, capped at `room`,
 * at `height` when one is given, and at the insert route's side limit, with
 * its ratio kept.
 */
export function placedSize(
  natural: AssetSize | null,
  room: number,
  height = 0,
): AssetSize {
  const size =
    natural && natural.width > 0 && natural.height > 0 ? natural : FALLBACK_SIZE
  const scale = Math.min(
    1,
    room > 0 ? room / size.width : 1,
    height > 0 ? height / size.height : 1,
    MAX_SIDE / size.width,
    MAX_SIDE / size.height,
  )
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  }
}

/** The least room a free drop keeps past the pointer on each axis. */
const LEAST_ROOM = 24

/**
 * A file dropped free at the pointer, fitted to the container's `room` and
 * to the frame `past` the pointer, its distance to the right and bottom
 * edges, so it never lands past either. Under `LEAST_ROOM` left on an axis,
 * it fits that much and steps `back` from the pointer to stay inside.
 */
export function fitFromPointer(
  natural: AssetSize | null,
  room: number,
  past: { x: number; y: number },
): { size: AssetSize; back: { x: number; y: number } } {
  const across = Math.max(past.x, LEAST_ROOM)
  const size = placedSize(
    natural,
    room > 0 ? Math.min(room, across) : across,
    Math.max(past.y, LEAST_ROOM),
  )
  return {
    size,
    back: {
      x: Math.max(0, size.width - past.x),
      y: Math.max(0, size.height - past.y),
    },
  }
}

/**
 * The size a file draws at on its own, audio taking `AUDIO_SIZE` unread. Null
 * for a model, and when it does not load, states no size, or a video's
 * metadata stalls.
 */
export function naturalSize(
  url: string,
  kind: AssetKind,
  timeout = METADATA_MS,
): Promise<AssetSize | null> {
  if (kind === 'svg') return svgSize(url)
  if (kind === 'audio') return Promise.resolve(AUDIO_SIZE)
  // A model states no size of its own, so its file is never loaded to ask.
  if (kind === 'model') return Promise.resolve(null)
  return new Promise((resolve) => {
    const media =
      kind === 'video' ? document.createElement('video') : new Image()
    const done = (size: AssetSize | null) => {
      clearTimeout(timer)
      media.removeAttribute('src')
      resolve(size && size.width > 0 && size.height > 0 ? size : null)
    }
    const timer = setTimeout(() => done(null), timeout)
    media.addEventListener('error', () => done(null), { once: true })
    if (media instanceof HTMLVideoElement) {
      media.preload = 'metadata'
      media.muted = true
      media.addEventListener(
        'loadedmetadata',
        () => done({ width: media.videoWidth, height: media.videoHeight }),
        { once: true },
      )
    } else {
      media.addEventListener(
        'load',
        () => done({ width: media.naturalWidth, height: media.naturalHeight }),
        { once: true },
      )
    }
    media.src = url
  })
}

/** A plain or `px` length, the only kind an SVG's root states a size in without a container. */
const LENGTH = /^\s*(\d+(?:\.\d+)?)(?:px)?\s*$/

/**
 * An SVG's size from its root's width and height, else its view box. Read
 * off the markup, since a browser gives an SVG stating neither a 300 by 150
 * natural size that is no size of its own.
 */
async function svgSize(url: string): Promise<AssetSize | null> {
  let text: string
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    text = await response.text()
  } catch {
    return null
  }
  const root = new DOMParser().parseFromString(
    text,
    'image/svg+xml',
  ).documentElement
  if (root.localName !== 'svg') return null
  const width = LENGTH.exec(root.getAttribute('width') ?? '')?.[1]
  const height = LENGTH.exec(root.getAttribute('height') ?? '')?.[1]
  if (width && height) return sized(Number(width), Number(height))
  const box = (root.getAttribute('viewBox') ?? '')
    .trim()
    .split(/[\s,]+/)
    .map(Number)
  return box.length === 4 ? sized(box[2] ?? 0, box[3] ?? 0) : null
}

function sized(width: number, height: number): AssetSize | null {
  return width > 0 && height > 0
    ? { width: Math.round(width), height: Math.round(height) }
    : null
}
