import {
  characterKeysOn,
  characterKeysStore,
} from '@/client/actions/character-keys'
import { isCharacterKey } from '@/client/actions/keys'
import { runKey } from '@/client/actions/registry'

import { subscribe } from './bridge/channel'
import { followPage } from './bridge/shown'

/**
 * Has each page an iframe loads take `keys`, the board running the action a
 * press names. A character key binds only while single-key shortcuts are on,
 * since the frame prevents a press before the board could leave it (WCAG 2.1.4).
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
          // A frame's own script can push in the bridge's shape, so only a bound key runs.
          ({ key, repeat }) => {
            if (taken.includes(key)) runKey(key, repeat)
          },
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
