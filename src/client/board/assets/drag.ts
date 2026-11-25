import { isPlaceableKind, type PlaceableKind } from '@/shared/asset-kinds'
import type { AssetFile } from '@/shared/records/assets'

/** A file a placement lands, by its path under the project's `assets/`. */
export interface PlaceableFile {
  project: string
  path: string
  kind: PlaceableKind
}

export function isPlaceable(
  file: AssetFile,
): file is AssetFile & { kind: PlaceableKind } {
  return isPlaceableKind(file.kind)
}

/** Marks a drag as an Assets tile's, so no other drag on the board reads as one. */
const TILE = Symbol('asset-tile')

/** The data an Assets tile's drag carries. */
export function tileDragData(
  file: PlaceableFile,
): Record<string | symbol, unknown> {
  return { [TILE]: true, ...file }
}

/** The file a drag carries, or null for a drag that is no Assets tile's. */
export function draggedFile(
  data: Record<string | symbol, unknown>,
): PlaceableFile | null {
  const { project, path, kind } = data
  return data[TILE] === true &&
    typeof project === 'string' &&
    typeof path === 'string' &&
    isPlaceableKind(kind)
    ? { project, path, kind }
    : null
}
