/** Chromium's screenshot surface stops at this many pixels on either side. */
export const MAX_COMPOSITE_SIDE = 16384

/** Space left around the frames of a composite, past each outermost edge, and between a filmstrip's frames. */
export const COMPOSITE_MARGIN = 40

/** A filmstrip's width in CSS pixels: `count` copies of the frame in a row, one margin around and between them. */
export function filmstripWidth(frameWidth: number, count: number): number {
  return count * frameWidth + (count + 1) * COMPOSITE_MARGIN
}

/**
 * The most moments a filmstrip of a frame this wide holds at `scale` before
 * the screenshot surface refuses it, so a picker offers only counts that
 * render.
 */
export function maxFilmstripCount(frameWidth: number, scale: number): number {
  const room = MAX_COMPOSITE_SIDE / scale - COMPOSITE_MARGIN
  return Math.floor(room / (frameWidth + COMPOSITE_MARGIN))
}
