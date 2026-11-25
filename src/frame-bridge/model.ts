import {
  type Axes,
  type ModelReading,
  type ModelStage,
  type ModelTransform,
  STAGED_ATTRIBUTES,
  type StagedAttribute,
  stagedTerms,
} from '@/shared/frame-bridge/model'
import { VIEWER_TAG } from '@/shared/model-viewer'

import { addressed, type Handlers } from './handler'

/** What the bridge reads off a viewer, each member absent on one no script drew. */
interface Viewer extends HTMLElement {
  loaded?: boolean
  availableAnimations?: string[]
  currentTime?: number
  updateComplete?: Promise<unknown>
  /** The camera's place in radians and meters, eased toward the stated orbit. */
  getCameraOrbit?: () => { theta: number; phi: number; radius: number }
  /** The vertical view in degrees, as the viewer widened it to fit the model's width. */
  getFieldOfView?: () => number
  /** The narrowest box a framed model fits by its height alone, as width over height. */
  getIdealAspect?: () => number
  getBoundingBoxCenter?: () => Axes
  getDimensions?: () => Axes
  /** Frames the model as a load would, which a live scale never does. */
  updateFraming?: () => Promise<void>
  jumpCameraToGoal?: () => void
  pause?: () => void
}

const EVENTS = ['load', 'error', 'camera-change'] as const

/** The `<model-viewer>` an address names, or null for other bytes or no viewer there. */
function viewerAt(address: { index: number; hash: string }): Viewer | null {
  const target = addressed(address)
  return target instanceof HTMLElement && target.localName === VIEWER_TAG
    ? target
    : null
}

/** An angle in whole degrees from -179 to 180, since a turned camera's theta keeps counting. */
function degrees(radians: number): number {
  const turned = Math.round((radians * 180) / Math.PI) % 360
  return turned > 180 ? turned - 360 : turned <= -180 ? turned + 360 : turned
}

/** A measure at six digits, so a reading's noise never counts as a change. */
function measured(value: number): number {
  return Number(value.toPrecision(6))
}

function axesOf({ x, y, z }: Axes): Axes {
  return { x: measured(x), y: measured(y), z: measured(z) }
}

function readModel(viewer: Viewer): ModelReading {
  const loaded = viewer.loaded === true
  const view = loaded ? viewer.getFieldOfView?.() : undefined
  const center = loaded ? viewer.getBoundingBoxCenter?.() : undefined
  const size = loaded ? viewer.getDimensions?.() : undefined
  const orbit = loaded ? viewer.getCameraOrbit?.() : undefined
  const staged = {} as Record<StagedAttribute, string | null>
  for (const name of STAGED_ATTRIBUTES) staged[name] = viewer.getAttribute(name)
  return {
    src: viewer.getAttribute('src') ?? '',
    loaded,
    clips: loaded ? [...(viewer.availableAnimations ?? [])] : [],
    orbit: orbit
      ? { theta: degrees(orbit.theta), phi: degrees(orbit.phi) }
      : null,
    camera:
      orbit && view !== undefined
        ? { distance: measured(orbit.radius), view: measured(view) }
        : null,
    bounds:
      center && size ? { center: axesOf(center), size: axesOf(size) } : null,
    staged,
  }
}

/**
 * What a viewer rests at with each attribute gone, by its property. The
 * viewer reads a dropped attribute as null, which throws on a transform and
 * frames nearer than its own defaults.
 */
const RESTING: Partial<
  Record<StagedAttribute, { property: string; value: string }>
> = {
  'camera-orbit': { property: 'cameraOrbit', value: '0deg 75deg 105%' },
  'min-camera-orbit': { property: 'minCameraOrbit', value: 'auto' },
  'max-camera-orbit': { property: 'maxCameraOrbit', value: 'auto' },
  'camera-target': { property: 'cameraTarget', value: 'auto auto auto' },
  'field-of-view': { property: 'fieldOfView', value: 'auto' },
  'max-field-of-view': { property: 'maxFieldOfView', value: 'auto' },
  orientation: { property: 'orientation', value: '0 0 0' },
  scale: { property: 'scale', value: '1 1 1' },
}

/** States one attribute, or the viewer's own rest for one that goes. */
function state(
  viewer: Viewer,
  name: StagedAttribute,
  value: string | null,
): void {
  if (value !== null) {
    viewer.setAttribute(name, value)
    return
  }
  viewer.removeAttribute(name)
  const resting = RESTING[name]
  // A viewer no script drew has no such property, and setting one would hide it from the script.
  if (resting && resting.property in viewer) {
    Reflect.set(viewer, resting.property, resting.value)
  }
}

/** Resolves once the live camera stands where its attributes state, with no easing. */
async function settle(viewer: Viewer): Promise<void> {
  await viewer.updateComplete
  viewer.jumpCameraToGoal?.()
  await viewer.updateComplete
  // The viewer jumps in a task of its own after that update.
  await Promise.resolve()
}

/** Settles a target over a scale in the same update, since one left to the viewer follows the center it read first. */
async function settleTarget(viewer: Viewer): Promise<void> {
  await viewer.updateComplete
  state(viewer, 'camera-target', viewer.getAttribute('camera-target'))
  await settle(viewer)
}

/** Frames a drawn model as a load of its attributes would. */
async function reframe(viewer: Viewer): Promise<void> {
  await viewer.updateComplete
  await viewer.updateFraming?.()
  await settle(viewer)
}

/** Shows one staging attribute as a fresh load of the written file would. */
function stage(
  viewer: Viewer,
  name: StagedAttribute,
  value: string | null,
): void {
  state(viewer, name, value)
  if (name === 'camera-orbit' || name === 'orientation' || name === 'scale') {
    // The camera eases toward an orbit, and a transform throws in the viewer before it asks for a redraw.
    void settle(viewer)
  }
  if (name === 'camera-target') void settleTarget(viewer)
  if (name === 'field-of-view' && viewer.loaded) {
    // The view a load takes depends on the model's framing, which no attribute alone redoes.
    void reframe(viewer)
  }
  if (name === 'autoplay' && value === null && viewer.loaded) {
    // A viewer keeps playing once its autoplay goes, where a load without it rests at the start.
    viewer.pause?.()
    viewer.currentTime = 0
  }
}

/** An attribute's three terms, `auto` for each it leaves out. */
function three(viewer: Viewer, name: StagedAttribute): string[] {
  const [x = 'auto', y = 'auto', z = 'auto'] = stagedTerms(
    viewer.getAttribute(name),
  )
  return [x, y, z]
}

/** States an attribute's last term and keeps the rest, dropping one left all `auto` or at its angles' rest. */
function stateLast(viewer: Viewer, name: StagedAttribute, last: string): void {
  const [first = 'auto', second = 'auto'] = three(viewer, name)
  const stated = `${first} ${second} ${last}`
  const resting = ['auto auto auto', '0deg 75deg auto'].includes(stated)
  state(viewer, name, resting ? null : stated)
}

/** States the camera's distance and opens the reach around it, or leaves both to the viewer on null. */
function stateDistance(viewer: Viewer, meters: number | null): void {
  const radius = meters === null ? 'auto' : `${measured(meters)}m`
  const [theta, phi] = three(viewer, 'camera-orbit')
  if (meters !== null && theta === 'auto' && phi === 'auto') {
    viewer.setAttribute('camera-orbit', `0deg 75deg ${radius}`)
  } else {
    stateLast(viewer, 'camera-orbit', radius)
  }
  stateLast(viewer, 'max-camera-orbit', radius)
  // The viewer keeps its camera outside the model's framed size, which a larger model passes.
  stateLast(viewer, 'min-camera-orbit', meters === null ? 'auto' : '0m')
}

/** The widest view a viewer takes with none stated, in degrees. */
const WIDEST = 30

/** States the view, and the widest one past the viewer's own, or leaves both to the viewer on null. */
function stateView(viewer: Viewer, degrees: number | null): void {
  const before = viewer.getAttribute('field-of-view')
  const widest = viewer.getAttribute('max-field-of-view')
  const value = degrees === null ? null : `${measured(degrees)}deg`
  state(viewer, 'field-of-view', value)
  // A widest view equal to the stated one is a hold's own, and any other is the file's.
  const held = widest === null || widest === before
  if (!held) return
  const past = degrees !== null && degrees > WIDEST
  state(viewer, 'max-field-of-view', past ? value : null)
}

/** Degrees as half an angle's tangent, what the viewer's width fit multiplies, and back. */
const tangent = (degrees: number) => Math.tan((degrees * Math.PI) / 360)
const angleOf = (tan: number) => (Math.atan(tan) * 360) / Math.PI

/** Whether two measures differ by less than a share of the second, half a percent unless told. */
const near = (a: number, b: number, share = 0.005) =>
  Math.abs(a - b) < b * share

/**
 * The stated view a load widens to `view`. The viewer widens by the framed
 * model's own width, which it measures from the stated view, so each guess
 * takes the last one's answer.
 */
async function holdView(viewer: Viewer, view: number): Promise<void> {
  const aspect =
    Math.max(1, viewer.clientWidth) / Math.max(1, viewer.clientHeight)
  let stated = view
  for (let guess = 0; guess < 8; guess += 1) {
    stateView(viewer, stated)
    await reframe(viewer)
    const widened = Math.max(1, (viewer.getIdealAspect?.() ?? 0) / aspect)
    // Closer than a load's own rounding, since each edit holds what the last one drew.
    if (near(angleOf(tangent(stated) * widened), view, 0.0002)) return
    stated = angleOf(tangent(view) / widened)
  }
}

/** Every attribute a transform's hold may touch. */
const HELD = [
  'scale',
  'camera-target',
  'camera-orbit',
  'min-camera-orbit',
  'max-camera-orbit',
  'field-of-view',
  'max-field-of-view',
] as const satisfies readonly StagedAttribute[]

/** Shows a scale and a depth, the camera's distance and view standing as they are. */
async function showTransform(
  viewer: Viewer,
  { scale, depth }: ModelTransform,
): Promise<void> {
  const even = scale.x === 1 && scale.y === 1 && scale.z === 1
  state(viewer, 'scale', even ? null : `${scale.x} ${scale.y} ${scale.z}`)
  await viewer.updateComplete
  const center = viewer.getBoundingBoxCenter?.()
  if (depth !== null && center) {
    stateLast(
      viewer,
      'camera-target',
      depth === 0 ? 'auto' : `${measured(center.z - depth)}m`,
    )
  }
  await settleTarget(viewer)
}

/**
 * Shows a transform as a fresh load of the returned attributes would, each of
 * distance and view stated only where the framing alone answers another.
 */
async function holdTransform(
  viewer: Viewer,
  transform: ModelTransform,
): Promise<ModelStage[]> {
  await settle(viewer)
  const distance = viewer.getCameraOrbit?.().radius ?? 0
  const view = viewer.getFieldOfView?.() ?? WIDEST
  await showTransform(viewer, transform)
  stateDistance(viewer, null)
  stateView(viewer, null)
  await reframe(viewer)
  if (!near(viewer.getCameraOrbit?.().radius ?? 0, distance)) {
    stateDistance(viewer, distance)
    await settle(viewer)
  }
  if (!near(viewer.getFieldOfView?.() ?? 0, view)) await holdView(viewer, view)
  return HELD.map((name) => ({ name, value: viewer.getAttribute(name) }))
}

/** Runs one transform at a time, since each waits on the viewer's own updates. */
let transforming: Promise<unknown> = Promise.resolve()

export const modelHandlers: Handlers = {
  model: (address, { push, onClose }) => {
    const viewer = viewerAt(address)
    if (!viewer) return null
    const first = readModel(viewer)
    let sent = JSON.stringify(first)
    // A turning camera fires on every frame, most of them inside one whole degree.
    const read = () => {
      const reading = readModel(viewer)
      const next = JSON.stringify(reading)
      if (next === sent) return
      sent = next
      push(reading)
    }
    for (const name of EVENTS) viewer.addEventListener(name, read)
    const stated = new MutationObserver(read)
    stated.observe(viewer, { attributeFilter: ['src', ...STAGED_ATTRIBUTES] })
    onClose(() => {
      for (const name of EVENTS) viewer.removeEventListener(name, read)
      stated.disconnect()
    })
    return first
  },
  'model-stage': ({ name, value, ...address }) => {
    const viewer = viewerAt(address)
    if (!viewer) return false
    stage(viewer, name, value)
    return true
  },
  'model-transform': ({ preview, scale, depth, ...address }, { push }) => {
    const viewer = viewerAt(address)
    if (viewer?.loaded !== true) return false
    const transform = { scale, depth }
    transforming = transforming
      .then(async () => {
        if (preview) await showTransform(viewer, transform)
        else push(await holdTransform(viewer, transform))
      })
      // A viewer whose script threw has no attributes to write, which the board reads as a refusal.
      .catch(() => push([]))
    return true
  },
}
