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
 * Hears each key pressed inside a frame's page until the answer is called,
 * since a frame on another origin hides its window from the board.
 */
export type HearFrame = (
  iframe: HTMLIFrameElement,
  onKey: () => void,
) => () => void

/**
 * Marks pointer-taken focus until blur, since the browser's `:focus-visible`
 * turns on at any key, Shift included, which rang a row before a Shift-click.
 * Given no `hearFrame`, focus leaving a frame always reads as a pointer press.
 */
export function markPointerFocus(
  target: Window,
  hearFrame?: HearFrame,
): () => void {
  const document = target.document
  let pointer = false
  // Held to the end of the keydown's task, after a key's own focus move.
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
  // Heard for a key, since Tab inside a frame leaves with no key seen here.
  // Kept past focus coming back, since the frame's push can land after it.
  let unhearFrame = () => {}
  const onFrameKey = () => {
    pointer = false
    const active = document.activeElement
    // Focus already came back on the key that left the frame, so the mark
    // the pointer reading set is wrong.
    if (active && !(active instanceof HTMLIFrameElement)) {
      active.removeAttribute(MARK)
    }
  }
  const onBlur = () => {
    const active = document.activeElement
    if (!(active instanceof HTMLIFrameElement)) return
    if (!keying) pointer = true
    unhearFrame()
    unhearFrame = hearFrame?.(active, onFrameKey) ?? (() => {})
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
    unhearFrame()
  }
}
