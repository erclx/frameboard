// A stand-in for the model viewer's script that draws nothing. The real one
// renders through WebGL, which starves every other test sharing the browser,
// so a bridge test loads this to read the element's API alone. Its framing
// follows the real viewer's: a load fits the camera to the scaled model, a
// live scale never does, and a dropped `scale` reads as null.

const RADIANS = Math.PI / 180
const tangent = (degrees) => Math.tan((degrees * RADIANS) / 2)

/** The unscaled model, whose center sits apart from its origin. */
const SIZE = { x: 0.72, y: 1.5, z: 0.1 }
const CENTER = { x: 0, y: 0, z: 0.5 }

const PROPERTIES = {
  'camera-orbit': 'cameraOrbit',
  'min-camera-orbit': 'minCameraOrbit',
  'max-camera-orbit': 'maxCameraOrbit',
  'camera-target': 'cameraTarget',
  'field-of-view': 'fieldOfView',
  'max-field-of-view': 'maxFieldOfView',
  orientation: 'orientation',
  scale: 'scale',
}

/** The first two terms of a `camera-orbit`, in radians, or null for any other value. */
function anglesOf(orbit) {
  const [theta, phi] = (orbit ?? '')
    .split(/\s+/)
    .map((term) => parseFloat(term))
  return Number.isFinite(theta) && Number.isFinite(phi)
    ? { theta: theta * RADIANS, phi: phi * RADIANS }
    : null
}

/** A stated value's last term as a number, or null for `auto` and a percentage. */
function lastOf(value) {
  const last = (value ?? '').split(/\s+/).at(-1) ?? ''
  return /^-?[\d.]+(m|deg)$/.test(last) ? parseFloat(last) : null
}

// The viewer's nearest limit wins over its farthest one.
const clamp = (value, low, high) => Math.max(low, Math.min(high, value))

class StubViewer extends HTMLElement {
  static observedAttributes = Object.keys(PROPERTIES)

  loaded = false
  paused = true
  currentTime = 0
  availableAnimations = []

  cameraOrbit = '0deg 75deg 105%'
  minCameraOrbit = 'auto'
  maxCameraOrbit = 'auto'
  cameraTarget = 'auto auto auto'
  fieldOfView = 'auto'
  maxFieldOfView = 'auto'
  orientation = '0 0 0'
  scale = '1 1 1'

  // What is on screen, which a live transform leaves as it was, since the viewer throws before it asks for a redraw.
  drawn = { orientation: '0 0 0' }
  // What the last framing measured, which a live scale leaves as it was.
  framed = { radius: 1, idealAspect: 1 }
  applied = { x: 1, y: 1, z: 1 }
  angles = { theta: 0, phi: 75 * RADIANS }
  target = CENTER.z
  // The distance asked for, kept inside the limits as they stood, so a limit moving off it never brings it back.
  goalRadius = 1
  orbitStated = true
  // The viewer eases its camera toward a stated orbit, so the camera trails the goal until told to jump.
  camera = { theta: 0, phi: 75 * RADIANS, radius: 1, view: 30 }

  connectedCallback() {
    this.angles = anglesOf(this.getAttribute('camera-orbit')) ?? this.angles
    this.camera = { ...this.camera, ...this.angles }
    setTimeout(() => {
      this.loaded = true
      this.availableAnimations = ['Spin']
      if (this.hasAttribute('autoplay')) {
        this.paused = false
        this.currentTime = 0.4
      }
      this.transform()
      this.frame()
      this.camera = this.goal()
      this.draw()
      this.dispatchEvent(new CustomEvent('load'))
    })
  }

  attributeChangedCallback(name, _before, value) {
    this[PROPERTIES[name]] = value
    if (name === 'camera-orbit') {
      this.angles = anglesOf(value) ?? this.angles
      this.orbitStated = true
    }
    if (name === 'camera-target') this.retarget()
  }

  get updateComplete() {
    this.transform()
    this.reach()
    return Promise.resolve()
  }

  /** Holds the distance asked for inside the limits, read from the orbit only when one was stated or framed. */
  reach() {
    const asked = this.orbitStated
      ? (lastOf(this.cameraOrbit) ?? 1.05 * this.ideal)
      : this.goalRadius
    this.orbitStated = false
    this.goalRadius = clamp(
      asked,
      lastOf(this.minCameraOrbit) ?? 2.2 * this.framed.radius,
      lastOf(this.maxCameraOrbit) ?? this.ideal,
    )
  }

  /** Applies the stated scale, throwing on the null a dropped one reads as. */
  transform() {
    const [x, y = x, z = y] = this.scale.split(/\s+/).map(Number)
    this.applied = { x, y, z }
  }

  retarget() {
    this.target = lastOf(this.cameraTarget) ?? this.getBoundingBoxCenter().z
  }

  getDimensions() {
    const { x, y, z } = this.applied
    return { x: SIZE.x * x, y: SIZE.y * y, z: SIZE.z * z }
  }

  getBoundingBoxCenter() {
    return { ...CENTER, z: CENTER.z * this.applied.z }
  }

  get framedView() {
    return lastOf(this.fieldOfView) ?? 30
  }

  get ideal() {
    return this.framed.radius / Math.sin((this.framedView * RADIANS) / 2)
  }

  frame() {
    this.retarget()
    const { x, y, z } = this.getDimensions()
    const depth = Math.abs(this.target - this.getBoundingBoxCenter().z) + z / 2
    this.framed.radius = Math.hypot(x / 2, y / 2, depth)
    this.framed.idealAspect =
      Math.hypot(x / 2, depth) / (this.ideal - y / 2) / tangent(this.framedView)
    this.orbitStated = true
  }

  async updateFraming() {
    await this.updateComplete
    this.frame()
  }

  getIdealAspect() {
    return this.framed.idealAspect
  }

  /** A stated view as the viewer widens it to fit the framed model's width. */
  widened(degrees) {
    const aspect = this.clientWidth / this.clientHeight
    const fit = Math.max(1, this.framed.idealAspect / aspect)
    return (Math.atan(tangent(degrees) * fit) * 2) / RADIANS
  }

  goal() {
    this.reach()
    const widest = this.widened(lastOf(this.maxFieldOfView) ?? 30)
    return {
      ...this.angles,
      radius: this.goalRadius,
      view: clamp(this.widened(this.framedView), 12, widest),
    }
  }

  getCameraOrbit() {
    const { theta, phi, radius } = this.camera
    return { theta, phi, radius }
  }

  getFieldOfView() {
    return this.camera.view
  }

  draw() {
    this.drawn = { orientation: this.orientation }
  }

  jumpCameraToGoal() {
    this.camera = this.goal()
    this.draw()
    this.dispatchEvent(new CustomEvent('camera-change'))
  }

  pause() {
    this.paused = true
  }
}

customElements.define('model-viewer', StubViewer)
