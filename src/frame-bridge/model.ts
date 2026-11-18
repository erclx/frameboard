import {
  type ModelReading,
  STAGED_ATTRIBUTES,
  type StagedAttribute,
} from '@/shared/frame-bridge/model'
import { VIEWER_TAG } from '@/shared/model-viewer'

import { addressed, type Handlers } from './handler'

/** What the bridge reads off a viewer, each member absent on one no script drew. */
interface Viewer extends HTMLElement {
  loaded?: boolean
  availableAnimations?: string[]
  currentTime?: number
  updateComplete?: Promise<unknown>
  /** The camera's place in radians, eased toward the stated orbit. */
  getCameraOrbit?: () => { theta: number; phi: number }
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

function readModel(viewer: Viewer): ModelReading {
  const loaded = viewer.loaded === true
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
    staged,
  }
}

/** Shows one staging attribute as a fresh load of the written file would. */
function stage(
  viewer: Viewer,
  name: StagedAttribute,
  value: string | null,
): void {
  if (value === null) viewer.removeAttribute(name)
  else viewer.setAttribute(name, value)
  if (name === 'camera-orbit') {
    // The camera eases toward a new orbit, which a drag and a typed angle show at once.
    void viewer.updateComplete?.then(() => viewer.jumpCameraToGoal?.())
  }
  if (name === 'autoplay' && value === null && viewer.loaded) {
    // A viewer keeps playing once its autoplay goes, where a load without it rests at the start.
    viewer.pause?.()
    viewer.currentTime = 0
  }
}

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
}
