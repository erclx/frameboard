import type { AssetKind } from '@/shared/asset-kinds'

/** A placed file's box in CSS pixels. */
export interface AssetSize {
  width: number
  height: number
}

/** What a file with no intrinsic size lands at, a 16 by 9 box. */
export const FALLBACK_SIZE: AssetSize = { width: 240, height: 135 }

/** How long a video's metadata may take before the fallback stands in. */
const METADATA_MS = 3000

/**
 * The box a placed file lands at: its natural size, else the fallback, and
 * no wider than `room`, the container's content width, its ratio kept. A
 * container with no width caps nothing.
 */
export function placedSize(natural: AssetSize | null, room: number): AssetSize {
  const size =
    natural && natural.width > 0 && natural.height > 0 ? natural : FALLBACK_SIZE
  const scale = room > 0 && size.width > room ? room / size.width : 1
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  }
}

/**
 * The size a file at `url` draws at on its own, read off an image's natural
 * size, an SVG's own width and height else its view box, or a video's
 * metadata. Null when it does not load, when it states no size, as an SVG
 * with neither, or when a video's metadata has not come within a few seconds.
 */
export function naturalSize(
  url: string,
  kind: AssetKind,
  timeout = METADATA_MS,
): Promise<AssetSize | null> {
  if (kind === 'svg') return svgSize(url)
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
