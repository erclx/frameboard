export const ASSET_KINDS = [
  'image',
  'gif',
  'svg',
  'video',
  'audio',
  'font',
  'stylesheet',
  'script',
  'other',
] as const

export type AssetKind = (typeof ASSET_KINDS)[number]

/** The extensions a drop accepts, each with the kind its tile draws. */
const ACCEPTED: Record<string, Exclude<AssetKind, 'other'>> = {
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  webp: 'image',
  avif: 'image',
  gif: 'gif',
  svg: 'svg',
  mp4: 'video',
  webm: 'video',
  mov: 'video',
  mp3: 'audio',
  wav: 'audio',
  ogg: 'audio',
  m4a: 'audio',
  woff: 'font',
  woff2: 'font',
  ttf: 'font',
  otf: 'font',
  css: 'stylesheet',
  js: 'script',
  mjs: 'script',
}

/** The lowercase text after the last dot, empty when the name has none. */
export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot <= 0 ? '' : name.slice(dot + 1).toLowerCase()
}

/** `other` for a file an agent wrote that no tile has a mark for. */
export function assetKind(name: string): AssetKind {
  return ACCEPTED[extensionOf(name)] ?? 'other'
}

export function isAcceptedUpload(name: string): boolean {
  return extensionOf(name) in ACCEPTED
}
