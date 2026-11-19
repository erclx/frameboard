import { isPlaceableKind, type PlaceableKind } from '@/shared/asset-kinds'
import type { AssetFile } from '@/shared/records/assets'

import type { SaveRequest } from './sourcing'

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

/** Marks a drag as a found result's, which saves only once it drops on the canvas. */
const RESULT = Symbol('found-result')

/** A found result a drag carries, not yet in `assets/`. */
export interface DraggedResult {
  /** What saves it, the same request Save sends, so a drag and a click share one file. */
  request: SaveRequest
  /** The stem the saved file and a frame made for it take, as the save names it. */
  name: string
  /** The size in pixels the source reports, null when it reports none, as for every model. */
  natural: { width: number; height: number } | null
}

/** The data a found result's drag carries. */
export function resultDragData(
  result: DraggedResult,
): Record<string | symbol, unknown> {
  return { [RESULT]: result }
}

/** The result a drag carries, or null for a drag that is no found result's. */
export function draggedResult(
  data: Record<string | symbol, unknown>,
): DraggedResult | null {
  const result = data[RESULT]
  // Only `resultDragData` sets the private symbol, so what it holds is a `DraggedResult`.
  return typeof result === 'object' && result !== null
    ? (result as DraggedResult)
    : null
}
