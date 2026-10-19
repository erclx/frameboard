import type { AssetFile } from '@/shared/records/assets'

const KIND_LABELS: Record<AssetFile['kind'], string> = {
  image: 'image',
  gif: 'GIF',
  svg: 'SVG',
  video: 'video',
  audio: 'audio',
  font: 'font',
  stylesheet: 'stylesheet',
  script: 'script',
  other: 'file',
}

/** Decimal sizes as the tile draws them: `240 KB`, `1.2 MB`. */
export function formatSize(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`
  const kilobytes = Math.round(bytes / 1000)
  if (kilobytes < 1000) return `${kilobytes} KB`
  const megabytes = bytes / 1_000_000
  if (megabytes < 1000) return `${trimmed(megabytes)} MB`
  return `${trimmed(megabytes / 1000)} GB`
}

function trimmed(value: number): string {
  return value.toFixed(1).replace(/\.0$/, '')
}

/** The tile's second line, `<type> · <size>`. */
export function describeAsset({ kind, size }: AssetFile): string {
  return `${KIND_LABELS[kind]} · ${formatSize(size)}`
}

/**
 * The path a frame links a file by. A frame sits at
 * `<project>/<page>/<frame>.html`, so one `..` reaches the project's `assets/`.
 * Each segment is encoded, which the links rule decodes.
 */
export function linkPath(path: string): string {
  return `../assets/${path.split('/').map(encodeURIComponent).join('/')}`
}

/** Where the frame route serves a project's asset from, for a thumbnail. */
export function assetUrl(project: string, path: string): string {
  const segments = path.split('/').map(encodeURIComponent).join('/')
  return `/frames/${encodeURIComponent(project)}/assets/${segments}`
}
