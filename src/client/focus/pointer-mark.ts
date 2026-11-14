const MARK = 'data-pointer-focus'

/** Input types that take typing, whose ring shows on a click since it marks where typing lands. */
const TYPED = new Set([
  'date',
  'datetime-local',
  'email',
  'month',
  'number',
  'password',
  'search',
  'tel',
  'text',
  'time',
  'url',
  'week',
])

function takesTyping(element: Element): boolean {
  if (element instanceof HTMLTextAreaElement) return true
  if (element instanceof HTMLInputElement) return TYPED.has(element.type)
  return element instanceof HTMLElement && element.isContentEditable
}

/**
 * Marks with `data-pointer-focus` a control that takes focus while the last
 * press was a pointer's, and clears it on blur, so the stylesheet's
 * `focus-visible` variant can keep the ring for keyboard focus alone.
 *
 * The browser's own `:focus-visible` turns on for a focused control once any
 * key is pressed, Shift and board shortcuts included, which rang a row clicked
 * before a Shift-click. The mark is taken at focus and kept until blur, so a
 * key pressed after the click leaves it ringless. A field that takes typing is
 * never marked. A press inside a frame never reaches this window, so the
 * window losing focus to a frame counts as a pointer press, unless a key
 * pressed here moved it there in the same task, as Tab into a frame does, so
 * Tab back out still rings. Returns the function that stops it.
 */
export function markPointerFocus(target: Window): () => void {
  const document = target.document
  let pointer = false
  // True from a keydown here until the task it ran in ends, which is when a
  // key's own focus move, such as Tab into a frame, has already blurred.
  let keying = false

  const onPointer = () => {
    pointer = true
  }
  const onKey = () => {
    pointer = false
    keying = true
    target.setTimeout(() => (keying = false))
  }
  const onFocusIn = (event: FocusEvent) => {
    const element = event.target
    if (!(element instanceof Element)) return
    if (pointer && !takesTyping(element)) element.setAttribute(MARK, '')
    else element.removeAttribute(MARK)
  }
  const onFocusOut = (event: FocusEvent) => {
    if (event.target instanceof Element) event.target.removeAttribute(MARK)
  }
  const onBlur = () => {
    if (!keying && document.activeElement instanceof HTMLIFrameElement) {
      pointer = true
    }
  }

  target.addEventListener('pointerdown', onPointer, true)
  target.addEventListener('keydown', onKey, true)
  document.addEventListener('focusin', onFocusIn, true)
  document.addEventListener('focusout', onFocusOut, true)
  target.addEventListener('blur', onBlur)
  return () => {
    target.removeEventListener('pointerdown', onPointer, true)
    target.removeEventListener('keydown', onKey, true)
    document.removeEventListener('focusin', onFocusIn, true)
    document.removeEventListener('focusout', onFocusOut, true)
    target.removeEventListener('blur', onBlur)
  }
}
