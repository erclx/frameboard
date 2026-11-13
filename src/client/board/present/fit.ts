/** The most a frame grows, so a small one draws at twice its size rather than filling the room. */
const MAX_SCALE = 2

/**
 * The largest scale drawing `box` whole inside `room`, so a wide frame meets
 * the sides and a tall one the top and bottom, stopping at `MAX_SCALE`.
 */
export function fitScale(
  box: { width: number; height: number },
  room: { width: number; height: number },
): number {
  if (box.width <= 0 || box.height <= 0) return 1
  return Math.min(MAX_SCALE, room.width / box.width, room.height / box.height)
}
