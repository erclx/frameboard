import { tinykeys } from 'tinykeys'

import type { KeyBindings } from '@/shared/frame-bridge/messages'

import type { Handlers } from './handler'

function pressesButton(event: KeyboardEvent): boolean {
  return (
    (event.code === 'Space' || event.key === 'Enter') &&
    event.target instanceof Element &&
    event.target.closest('button') !== null
  )
}

/**
 * Whether a press stays with the page whatever it binds: a composing one, one
 * the page already prevented, while buttons are kept a Space or Enter on a
 * button, and while typing is kept, one in a field.
 */
function keptByPage(
  event: KeyboardEvent,
  { keepTyping, keepButtons }: Omit<KeyBindings, 'keys'>,
): boolean {
  if (event.isComposing || event.defaultPrevented) return true
  if (keepButtons && pressesButton(event)) return true
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
  keys: ({ keys, ...kept }, { push, onClose }) => {
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
      { ignore: (event) => keptByPage(event, kept) },
    )
    onClose(unbind)
    return true
  },
  'focus-keys': (_args, { push, onClose }) => {
    // The capture phase, so a page stopping its own keys still has them heard.
    const heard = () => push(true)
    window.addEventListener('keydown', heard, true)
    onClose(() => window.removeEventListener('keydown', heard, true))
    return true
  },
}
