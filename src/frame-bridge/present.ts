import { HIDE_CONTROLS_CSS } from '@/shared/bindings'
import { LOOK_MARKER } from '@/shared/theme'

import type { Handlers } from './handler'

const PAUSED =
  '*, *::before, *::after { animation-play-state: paused !important }'

/**
 * Holds `css` in the page until closed, marked so the element index skips it
 * and placed last so the look style stays first, answering whether it held a head.
 */
function holdStyle(css: string, onClose: (stop: () => void) => void): boolean {
  if (!document.head) return false
  const style = document.createElement('style')
  style.setAttribute(LOOK_MARKER, '')
  style.textContent = css
  document.head.append(style)
  onClose(() => style.remove())
  return true
}

/** What a presented page does for the audience's view: its clock held while it arrives, its controls hidden, and the pointer that wakes the bar. */
export const presentHandlers: Handlers = {
  // One style reaches an animation the page starts later too.
  'hold-animations': (_args, { onClose }) => holdStyle(PAUSED, onClose),
  'hide-controls': (_args, { onClose }) =>
    holdStyle(HIDE_CONTROLS_CSS, onClose),
  'pointer-move': (_args, { push, onClose }) => {
    let frame = 0
    const moved = () => {
      if (frame !== 0) return
      frame = requestAnimationFrame(() => {
        frame = 0
        push(null)
      })
    }
    addEventListener('pointermove', moved)
    onClose(() => {
      removeEventListener('pointermove', moved)
      cancelAnimationFrame(frame)
    })
    return true
  },
}
