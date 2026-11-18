/**
 * Cancels every open of a menu held shut, for `onOpenChange`. Base UI's own
 * `disabled` renders a native `disabled` trigger, which leaves the tab order,
 * so a held trigger marks itself `aria-disabled` instead.
 */
export function refuseOpen(
  open: boolean,
  details: { cancel: () => void },
): void {
  if (open) details.cancel()
}
