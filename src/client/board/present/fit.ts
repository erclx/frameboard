/**
 * The largest scale drawing `box` whole inside `room`, so a wide frame meets
 * the sides and a tall one the top and bottom.
 */
export function fitScale(
  box: { width: number; height: number },
  room: { width: number; height: number },
): number {
  if (box.width <= 0 || box.height <= 0) return 1
  return Math.min(room.width / box.width, room.height / box.height)
}
