import type { Axes, ModelReading } from '@/shared/frame-bridge/model'

import { type Angle, angleOf, type Turn, turnOf } from '../model-staging'
import type { HandleMode } from './store'

export type Axis = keyof Axes

/** A point or a drag in screen pixels, down the screen as Y grows. */
export interface Vector {
  x: number
  y: number
}

/** In screen pixels, at any zoom. */
export const HANDLE = 50

/** How near its tip a press takes a handle, a 24 pixel target across. */
export const TIP_REACH = 12

/** The shortest a handle seen end on draws, so its tip stays clear of the center. */
const SHORTEST = 24

/** Where an axis toward the viewer draws, down and left, since straight on it would draw as a point. */
const TOWARD: Vector = { x: -0.58, y: 0.41 }

const RADIANS = Math.PI / 180

export interface Handle {
  axis: Axis
  /** From the gizmo's center, in screen pixels. */
  tip: Vector
  /** How much of the axis's own length the handle shows, 1 for one across the page. */
  shown: number
  /** The direction a drag turns the model about the axis, one pixel long. */
  turning: Vector
}

const dot = (a: Axes, b: Axes) => a.x * b.x + a.y * b.y + a.z * b.z
const across = (a: Vector, b: Vector) => a.x * b.x + a.y * b.y
const unit = ({ x, y }: Vector): Vector => {
  const length = Math.hypot(x, y)
  return length < 0.01 ? { x: 1, y: 0 } : { x: x / length, y: y / length }
}

/** A scene's direction as its camera sees it: right, up, and toward the viewer. */
function seen(direction: Axes, { theta, phi }: Angle): Axes {
  const [st, ct] = [Math.sin(theta * RADIANS), Math.cos(theta * RADIANS)]
  const [sp, cp] = [Math.sin(phi * RADIANS), Math.cos(phi * RADIANS)]
  return {
    x: dot(direction, { x: ct, y: 0, z: -st }),
    y: dot(direction, { x: -cp * st, y: sp, z: -cp * ct }),
    z: dot(direction, { x: sp * st, y: cp, z: sp * ct }),
  }
}

function handleOf(axis: Axis, { x, y, z }: Axes): Handle {
  const drawn = { x: x + z * TOWARD.x, y: -y + z * TOWARD.y }
  const length = Math.hypot(drawn.x, drawn.y)
  const along = length < 0.01 ? unit(TOWARD) : unit(drawn)
  const pixels = Math.max(SHORTEST, length * HANDLE)
  const tip = { x: along.x * pixels, y: along.y * pixels }
  // The face nearest the viewer moves across the axis, and one pointed at the viewer turns round its own tip.
  const turning = unit({
    x: y + z * along.y,
    y: x - z * along.x,
  })
  return { axis, tip, shown: pixels / HANDLE, turning }
}

/** The axes each of the Rotation fields turns the model about, the viewer turning Y, then X, then Z. */
function turnAxes({ x, y }: Turn): Axes[] {
  const [sx, cx] = [Math.sin(x * RADIANS), Math.cos(x * RADIANS)]
  const [sy, cy] = [Math.sin(y * RADIANS), Math.cos(y * RADIANS)]
  return [
    { x: cy, y: 0, z: -sy },
    { x: 0, y: 1, z: 0 },
    { x: cx * sy, y: -sx, z: cx * cy },
  ]
}

/** The turned model's own axes, which a size is along. */
function ownAxes(turn: Turn): Axes[] {
  const [, , z] = turnAxes(turn)
  const [sx, cx] = [Math.sin(turn.x * RADIANS), Math.cos(turn.x * RADIANS)]
  const [sy, cy] = [Math.sin(turn.y * RADIANS), Math.cos(turn.y * RADIANS)]
  const [sz, cz] = [Math.sin(turn.z * RADIANS), Math.cos(turn.z * RADIANS)]
  return [
    { x: cz * cy + sz * sx * sy, y: sz * cx, z: -cz * sy + sz * sx * cy },
    { x: -sz * cy + cz * sx * sy, y: cz * cx, z: sz * sy + cz * sx * cy },
    z ?? { x: 0, y: 0, z: 1 },
  ]
}

/** Move's X and Y are the page's own and a placed model's alone, its Z the scene's, and the rest the model's. */
export function handlesOf(
  mode: HandleMode,
  reading: ModelReading,
  placed: boolean,
): Handle[] {
  const angle = angleOf(reading)
  const turn = turnOf(reading.staged.orientation)
  if (mode === 'move') {
    const depth = handleOf('z', seen({ x: 0, y: 0, z: 1 }, angle))
    return placed
      ? [
          handleOf('x', { x: 1, y: 0, z: 0 }),
          handleOf('y', { x: 0, y: 1, z: 0 }),
          depth,
        ]
      : [depth]
  }
  const axes = mode === 'turn' ? turnAxes(turn) : ownAxes(turn)
  return (['x', 'y', 'z'] as const).map((axis, order) =>
    handleOf(axis, seen(axes[order] ?? { x: 0, y: 0, z: 0 }, angle)),
  )
}

function alongOf({ tip }: Handle, drag: Vector): number {
  return across(drag, unit(tip))
}

/** How many degrees a drag turns the model about a handle's axis, half a degree a pixel as the camera's drag does. */
export function turnOfDrag(handle: Handle, drag: Vector): number {
  return Math.round(across(drag, handle.turning) / 2)
}

/** What a drag along a handle multiplies its axis by, zero once it reaches the center. */
export function sizeOfDrag(handle: Handle, drag: Vector): number {
  const length = Math.hypot(handle.tip.x, handle.tip.y)
  return Math.max(0, 1 + alongOf(handle, drag) / length)
}

/** How many meters a drag along the depth handle moves the model, following the pointer where the axis runs across the page. */
export function depthOfDrag(
  handle: Handle,
  drag: Vector,
  { distance, view }: NonNullable<ModelReading['camera']>,
  height: number,
): number {
  const tall = 2 * distance * Math.tan((view * RADIANS) / 2)
  const meters = (tall / Math.max(1, height)) * alongOf(handle, drag)
  return Number((meters / handle.shown).toFixed(2))
}

/**
 * Whether a model's box on screen holds the handles clear of its corner
 * marks, whichever way they point, so none comes and goes as the model turns.
 */
export function handlesFit(
  { width, height }: { width: number; height: number },
  reach: number,
): boolean {
  const clear = HANDLE + TIP_REACH + reach
  return Math.min(width, height) >= 24 && Math.hypot(width, height) / 2 >= clear
}
