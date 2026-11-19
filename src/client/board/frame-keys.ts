import {
  characterKeysOn,
  characterKeysStore,
} from '@/client/actions/character-keys'
import { isCharacterKey } from '@/client/actions/keys'
import { runKey } from '@/client/actions/registry'

import { subscribe } from './bridge/channel'
import { followPage } from './bridge/shown'

/**
 * Has each page an iframe loads take `keys` for the board, the frame
 * preventing a press itself and the board running the action it names, until
 * the answer is called. `keepTyping` leaves a press in the page's own fields
 * to the page.
 *
 * A character key is bound only while single-key shortcuts are on, since the
 * frame prevents a press before the board could leave it to the page, as
 * WCAG 2.1.4 asks, so the binding follows the switch.
 */
export function bindFrameKeys(
  iframe: HTMLIFrameElement,
  keys: readonly string[],
  { keepTyping }: { keepTyping: boolean },
): () => void {
  const follow = () => {
    const taken = keys.filter(
      (key) => !isCharacterKey(key) || characterKeysOn(),
    )
    return followPage(
      iframe,
      () =>
        subscribe(
          iframe,
          'keys',
          { keys: taken, keepTyping },
          ({ key, repeat }) => runKey(key, repeat),
        ).close,
    )
  }
  let stop = follow()
  const unwatch = characterKeysStore.subscribe((state, previous) => {
    if (state.on === previous.on) return
    stop()
    stop = follow()
  })
  return () => {
    unwatch()
    stop()
  }
}
