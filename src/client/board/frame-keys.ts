import { runKey } from '@/client/actions/registry'

import { subscribe } from './bridge/channel'
import { followPage } from './bridge/shown'

/**
 * Has each page an iframe loads take `keys` for the board, the frame
 * preventing a press itself and the board running the action it names, until
 * the answer is called. `keepTyping` leaves a press in the page's own fields
 * to the page.
 */
export function bindFrameKeys(
  iframe: HTMLIFrameElement,
  keys: readonly string[],
  { keepTyping }: { keepTyping: boolean },
): () => void {
  return followPage(
    iframe,
    () =>
      subscribe(
        iframe,
        'keys',
        { keys: [...keys], keepTyping },
        ({ key, repeat }) => runKey(key, repeat),
      ).close,
  )
}
