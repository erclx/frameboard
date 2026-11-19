import { tinykeys } from 'tinykeys'

import type { Handlers } from './handler'

/**
 * Whether a press stays with the page whatever it binds: a composing one, one
 * the page already prevented, and, while typing is kept, one in a field.
 */
function keptByPage(event: KeyboardEvent, keepTyping: boolean): boolean {
  if (event.isComposing || event.defaultPrevented) return true
  if (!keepTyping) return false
  const target = event.target
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.matches('[contenteditable],input,select,textarea'))
  )
}

/**
 * Takes the board's keys inside the frame, since a press posted out and
 * prevented on the board arrives after the page already scrolled or typed.
 */
export const keyHandlers: Handlers = {
  keys: ({ keys, keepTyping }, { push, onClose }) => {
    const unbind = tinykeys(
      window,
      Object.fromEntries(
        keys.map((key) => [
          key,
          (event: KeyboardEvent) => {
            event.preventDefault()
            push({ key, repeat: event.repeat })
          },
        ]),
      ),
      { ignore: (event) => keptByPage(event, keepTyping) },
    )
    onClose(unbind)
    return true
  },
}
