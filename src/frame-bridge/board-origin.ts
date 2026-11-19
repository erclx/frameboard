const LOOPBACK_ORIGIN = /^http:\/\/(127\.0\.0\.1|localhost)(:\d{1,5})?$/

/**
 * Whether the bridge answers a parent at `origin`: a board on either loopback
 * name and any port, so Vite's works unset, or the frame's `own` origin, as a
 * `srcdoc` frame shares.
 */
export function answersParent(origin: string, own: string): boolean {
  if (origin === 'null') return false
  return origin === own || LOOPBACK_ORIGIN.test(origin)
}
