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
 * Marks pointer-taken focus until blur, since the browser's `:focus-visible`
 * turns on at any key, Shift included, which rang a row before a Shift-click.
 */
export function markPointerFocus(target: Window): () => void {
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
  let heardFrame: Window | null = null
  const onFrameKey = () => {
    pointer = false
  }
  const unhearFrame = () => {
    heardFrame?.removeEventListener('keydown', onFrameKey, true)
    heardFrame = null
  }
  const onBlur = () => {
    const active = document.activeElement
    if (!(active instanceof HTMLIFrameElement)) return
    if (!keying) pointer = true
    unhearFrame()
    try {
      heardFrame = active.contentWindow
      heardFrame?.addEventListener('keydown', onFrameKey, true)
    } catch {
      // A frame on another origin hides its window, so its keys stay unheard.
      heardFrame = null
    }
  }

  target.addEventListener('pointerdown', onPointer, true)
  target.addEventListener('keydown', onKey, true)
  document.addEventListener('focusin', onFocusIn, true)
  document.addEventListener('focusout', onFocusOut, true)
  target.addEventListener('blur', onBlur)
  target.addEventListener('focus', unhearFrame)
  return () => {
    target.removeEventListener('pointerdown', onPointer, true)
    target.removeEventListener('keydown', onKey, true)
    document.removeEventListener('focusin', onFocusIn, true)
    document.removeEventListener('focusout', onFocusOut, true)
    target.removeEventListener('blur', onBlur)
    target.removeEventListener('focus', unhearFrame)
    unhearFrame()
  }
}
