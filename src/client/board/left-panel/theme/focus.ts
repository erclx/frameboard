/**
 * What a section's remove confirm hands the focus back to: the button that
 * opened it, and the dialog around the section once the removal took that
 * button away, since base-ui would fall through to the card behind the dialog.
 */
export function focusAfterConfirm(
  pressed: HTMLElement | null,
  section: HTMLElement | null,
): HTMLElement | true {
  if (pressed?.isConnected) return pressed
  return section?.closest<HTMLElement>('[role="dialog"]') ?? true
}
