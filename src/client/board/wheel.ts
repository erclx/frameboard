/** The pixels one line of a line-mode wheel event stands for. */
export const LINE_PX = 16

/** How long a notch's pan takes to land. */
export const PAN_EASE_MS = 120

/** The zoom a mouse notch takes, the toolbar's own step. */
const NOTCH_STEP = 1.2

/**
 * Whether one axis of a wheel event is a mouse notch. A mouse sends a
 * line-mode event or a pixel one of 50 or more per notch, while a trackpad
 * sends many small ones. No standard field tells the two apart, so a fast
 * trackpad fling reads as notches too.
 */
export function isNotch(delta: number, deltaMode: number): boolean {
  if (delta === 0) return false
  return deltaMode === WheelEvent.DOM_DELTA_LINE || Math.abs(delta) >= 50
}

/** One axis of a wheel event in screen pixels. */
export function wheelPixels(delta: number, deltaMode: number): number {
  return deltaMode === WheelEvent.DOM_DELTA_LINE ? delta * LINE_PX : delta
}

/**
 * The factor one zooming wheel event scales by. A notch steps once whatever
 * its size, while a pinch's small deltas follow the curve, so the pinch stays
 * smooth.
 */
export function wheelZoom(deltaY: number, deltaMode: number): number {
  if (deltaY === 0) return 1
  if (isNotch(deltaY, deltaMode)) {
    return deltaY < 0 ? NOTCH_STEP : 1 / NOTCH_STEP
  }
  return 2 ** (-deltaY * 0.01)
}

/** The share of a notch's pan covered at `t`, from 0 to 1, fast then settling. */
export function panEase(t: number): number {
  return 1 - (1 - t) ** 3
}
