import type { FindHit } from '@/shared/records/find'

import { jumpTo } from '../jump'
import {
  select,
  selectElement,
  type SelectionStore,
  selectionStore,
} from '../selection'

/**
 * Selects what a hit names on its page and zooms to its frame: the frame
 * for a frame hit, else the element by the index and hash the search read,
 * which the board drops to the frame when the file has changed since.
 */
export function pickHit(
  project: string,
  hit: FindHit,
  store: SelectionStore = selectionStore,
): void {
  const page = `${project}/${hit.page}`
  const { index, hash } = hit
  jumpTo(page, () => {
    if (index === null || hash === null) {
      select(store, page, [hit.ref])
      return
    }
    selectElement(store, page, { frame: hit.ref, index, hash })
  })
}
