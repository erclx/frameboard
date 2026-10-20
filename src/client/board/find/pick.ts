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
 * Selects what a hit names on its page and zooms to its frame: the frame
 * for a frame hit, else the element by the index and hash the search read.
 * A frame whose iframe already shows other bytes takes the frame alone, as
 * its own load check would, since that check has already run and the index
 * may now name another element. A frame not live yet runs that check on load.
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
