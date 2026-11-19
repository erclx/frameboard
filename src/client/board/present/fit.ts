import {
  bezelBox,
  bezelReach,
  type Device,
  shownBox,
} from '@/shared/frame-device'

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

/**
 * The scale a frame presents at, holding all its device paints while the body
 * stays centered, so a shadow reaching further below never lifts the device.
 * It fits the box the frame is shown at, one screen for a page-tall phone.
 */
export function presentScale(
  frame: {
    box: { width: number; height: number }
    device?: Device | null
    scroll?: boolean
  },
  room: { width: number; height: number },
): number {
  const { width, height } = shownBox(frame)
  const box = { x: 0, y: 0, width, height }
  const body = bezelBox(box, frame.device)
  const reach = bezelReach(box, frame.device)
  const centerX = body.x + body.width / 2
  const centerY = body.y + body.height / 2
  const halfWidth = Math.max(centerX - reach.x, reach.x + reach.width - centerX)
  const halfHeight = Math.max(
    centerY - reach.y,
    reach.y + reach.height - centerY,
  )
  return fitScale({ width: 2 * halfWidth, height: 2 * halfHeight }, room)
}
