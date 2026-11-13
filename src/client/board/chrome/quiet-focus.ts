/** Marks a control the app focused itself, whose tooltip stays shut until it loses that focus. */
const QUIET_FOCUS = 'data-quiet-focus'

/**
 * Focuses `element` without opening its tooltip, for focus the app hands
 * back, such as leaving present mode, rather than focus a person gave. The
 * next focus after it blurs opens the tooltip as usual, and hover always does.
 */
export function focusWithoutTooltip(element: HTMLElement): void {
  element.setAttribute(QUIET_FOCUS, '')
  element.addEventListener('blur', () => element.removeAttribute(QUIET_FOCUS), {
    once: true,
  })
  element.focus()
}

/** Whether `element` holds focus `focusWithoutTooltip` gave it. */
export function hasQuietFocus(element: Element | undefined): boolean {
  return element?.hasAttribute(QUIET_FOCUS) ?? false
}
