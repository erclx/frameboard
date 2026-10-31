import type { AssetFile } from '@/shared/records/assets'

/** The kind filters above the tiles, in the order they draw. */
export const CHIPS = ['all', 'images', 'video', 'fonts', 'other'] as const

export type Chip = (typeof CHIPS)[number]

export const CHIP_LABELS: Record<Chip, string> = {
  all: 'All',
  images: 'Images',
  video: 'Video',
  fonts: 'Fonts',
  other: 'Other',
}

/** The chip a file's kind falls under, every kind landing under exactly one. */
export function chipOf(kind: AssetFile['kind']): Exclude<Chip, 'all'> {
  switch (kind) {
    case 'image':
    case 'gif':
    case 'svg':
      return 'images'
    case 'video':
      return 'video'
    case 'font':
      return 'fonts'
    default:
      return 'other'
  }
}

/** Each chip with its file count, All always and the rest only when a file falls under them. */
export function chipCounts(
  files: readonly AssetFile[],
): { chip: Chip; count: number }[] {
  return CHIPS.map((chip) => ({
    chip,
    count:
      chip === 'all'
        ? files.length
        : files.filter((file) => chipOf(file.kind) === chip).length,
  })).filter(({ chip, count }) => chip === 'all' || count > 0)
}

/** One subfolder of `assets/` by its path there, empty for the folder's own files. */
export interface AssetGroup {
  folder: string
  files: AssetFile[]
}

/**
 * The files the chip and the search keep, grouped by the folder holding them:
 * the root's files first, then each folder by path, each keeping the listing's
 * order. The search matches anywhere in the path, ignoring case.
 */
export function groupAssets(
  files: readonly AssetFile[],
  { chip, search }: { chip: Chip; search: string },
): AssetGroup[] {
  const needle = search.trim().toLowerCase()
  const groups = new Map<string, AssetFile[]>()
  for (const file of files) {
    if (chip !== 'all' && chipOf(file.kind) !== chip) continue
    if (needle !== '' && !file.path.toLowerCase().includes(needle)) continue
    const folder = folderOf(file.path)
    const group = groups.get(folder)
    if (group) group.push(file)
    else groups.set(folder, [file])
  }
  return [...groups]
    .map(([folder, grouped]) => ({ folder, files: grouped }))
    .sort((a, b) => byFolder(a.folder, b.folder))
}

/** The part of a path before its last `/`, empty at the root. */
export function folderOf(path: string): string {
  const slash = path.lastIndexOf('/')
  return slash === -1 ? '' : path.slice(0, slash)
}

/** The part after it, the name a tile shows inside its group. */
export function fileName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

function byFolder(a: string, b: string): number {
  if (a === '' || b === '') return a === '' ? (b === '' ? 0 : -1) : 1
  return a.toLowerCase().localeCompare(b.toLowerCase())
}
