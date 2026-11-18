import type { FindHit } from '@/shared/records/find'

import { shownHash } from '../inspector/element/write'
import { jumpTo } from '../jump'
import {
  awaitingHash,
  select,
  selectElement,
  type SelectionStore,
  selectionStore,
} from '../selection'

/**
 * Selects a hit and zooms to its frame. A frame already showing other bytes
 * takes the frame alone, since its load check has run and the index may move.
 */
export function pickHit(
  project: string,
  hit: FindHit,
  store: SelectionStore = selectionStore,
  shown: (ref: string) => string | null = shownHash,
): void {
  const page = `${project}/${hit.page}`
  const { index, hash } = hit
  jumpTo(page, () => {
    const showing = shown(hit.ref)
    const stale =
      showing !== null && showing !== hash && !awaitingHash(hit.ref, showing)
    if (index === null || hash === null || stale) {
      select(store, page, [hit.ref])
      return
    }
    selectElement(store, page, { frame: hit.ref, index, hash })
  })
}
