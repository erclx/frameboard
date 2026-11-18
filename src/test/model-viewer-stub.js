// A stand-in for the model viewer's script that draws nothing. The real one
// renders through WebGL, which starves every other test sharing the browser,
// so a bridge test loads this to read the element's API alone.

const RADIANS = Math.PI / 180

/** The first two terms of a `camera-orbit`, in radians, or null for any other value. */
function anglesOf(orbit) {
  const [theta, phi] = (orbit ?? '')
    .split(/\s+/)
    .map((term) => parseFloat(term))
  return Number.isFinite(theta) && Number.isFinite(phi)
    ? { theta: theta * RADIANS, phi: phi * RADIANS }
    : null
}

class StubViewer extends HTMLElement {
  static observedAttributes = ['camera-orbit']

  loaded = false
  paused = true
  currentTime = 0
  availableAnimations = []
  updateComplete = Promise.resolve()

  // The viewer eases its camera toward a stated orbit, so the camera trails the goal until told to jump.
  goal = { theta: 0, phi: 75 * RADIANS }
  camera = { ...this.goal }

  connectedCallback() {
    const stated = anglesOf(this.getAttribute('camera-orbit'))
    if (stated) this.goal = this.camera = stated
    setTimeout(() => {
      this.loaded = true
      this.availableAnimations = ['Spin']
      if (this.hasAttribute('autoplay')) {
        this.paused = false
        this.currentTime = 0.4
      }
      this.dispatchEvent(new CustomEvent('load'))
    })
  }

  attributeChangedCallback(_name, _before, value) {
    this.goal = anglesOf(value) ?? this.goal
  }

  getCameraOrbit() {
    return { ...this.camera, radius: 1 }
  }

  jumpCameraToGoal() {
    this.camera = { ...this.goal }
    this.dispatchEvent(new CustomEvent('camera-change'))
  }

  pause() {
    this.paused = true
  }
}

customElements.define('model-viewer', StubViewer)
