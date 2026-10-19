import type { Box } from './geometry/box'

/** What the mounted canvas does for a caller holding no `d3-zoom` handle. */
export interface CanvasControls {
  /** Scales about the viewport's center. */
  zoomBy: (factor: number) => void
  /** Sets the scale about the viewport's center, 1 being 100 percent. */
  zoomTo: (scale: number) => void
  /** Travels to the view showing every frame on the page. */
  fit: () => void
  /** Travels to the view showing these boxes, as zoom to fit shows the page. */
  fitTo: (boxes: readonly Box[]) => void
  /** Moves the view by a screen offset, so a positive `dx` brings in what lies to the right. */
  panBy: (dx: number, dy: number) => void
}

type Listener = () => void

let controls: CanvasControls | null = null
let zoom = 1
const zoomListeners = new Set<Listener>()
const attachListeners = new Set<Listener>()

/**
 * The canvas view controller. The zoom label and the zoom actions go through
 * it rather than through the canvas or `d3-zoom`, so a gesture's zoom reaches
 * the label with no React render.
 */
export const canvasView = {
  zoom: (): number => zoom,
  /** Whether a canvas is mounted to act on. */
  attached: (): boolean => controls !== null,
  /** Called on every zoom change, a gesture's frames included. */
  onZoom: (listener: Listener): (() => void) => listen(zoomListeners, listener),
  /** Called when a canvas mounts or unmounts. */
  onAttach: (listener: Listener): (() => void) =>
    listen(attachListeners, listener),
  zoomBy: (factor: number): void => controls?.zoomBy(factor),
  zoomTo: (scale: number): void => controls?.zoomTo(scale),
  fit: (): void => controls?.fit(),
  fitTo: (boxes: readonly Box[]): void => controls?.fitTo(boxes),
  panBy: (dx: number, dy: number): void => controls?.panBy(dx, dy),
}

/** Called by the canvas on mount, returning the function its unmount calls. */
export function attachCanvas(next: CanvasControls): () => void {
  controls = next
  notify(attachListeners)
  return () => {
    if (controls !== next) return
    controls = null
    notify(attachListeners)
  }
}

/** Called by the canvas from its zoom handler. */
export function reportZoom(scale: number): void {
  if (scale === zoom) return
  zoom = scale
  notify(zoomListeners)
}

function listen(listeners: Set<Listener>, listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function notify(listeners: Set<Listener>): void {
  for (const listener of listeners) listener()
}
