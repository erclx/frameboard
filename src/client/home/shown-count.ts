const COUNT_KEY = 'frameboard.home.count'

/** A first visit's placeholders, a grid row's worth. */
export const FIRST_VISIT = 4

/** The most placeholders home draws, so a large board fills a screen rather than hundreds. */
export const MOST_PLACEHOLDERS = 12

/** How many placeholders home draws while it loads, from the entries it drew on the last visit. */
export function readShownCount(): number {
  try {
    const stored = Number(localStorage.getItem(COUNT_KEY))
    if (!Number.isInteger(stored) || stored < 1) return FIRST_VISIT
    return Math.min(stored, MOST_PLACEHOLDERS)
  } catch {
    return FIRST_VISIT
  }
}

/** Remembers how many top-level entries home drew, for the next visit's placeholders. */
export function writeShownCount(count: number): void {
  try {
    localStorage.setItem(COUNT_KEY, String(count))
  } catch {
    // A browser refusing storage draws a first visit's placeholders next time.
  }
}
