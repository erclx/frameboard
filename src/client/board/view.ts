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
  /**
   * Travels to center the box at `scale`, the current zoom when absent,
   * fitting it instead only when it is larger than the viewport at that zoom.
   */
  centerOn: (box: Box, scale?: number) => void
  /** The part of the canvas the viewport shows, in canvas coordinates. */
  visible: () => Box
}

type Listener = () => void

let controls: CanvasControls | null = null
let attachedPage: string | null = null
let zoom = 1
const zoomListeners = new Set<Listener>()
const attachListeners = new Set<Listener>()
const handListeners = new Set<Listener>()

/**
 * The canvas view controller. The zoom label and the zoom actions go through
 * it rather than through the canvas or `d3-zoom`, so a gesture's zoom reaches
 * the label with no React render.
 */
export const canvasView = {
  zoom: (): number => zoom,
  /** Whether a canvas is mounted to act on. */
  attached: (): boolean => controls !== null,
  /** The ref of the page the mounted canvas shows, null with none mounted. */
  page: (): string | null => attachedPage,
  /** Called on every zoom change, a gesture's frames included. */
  onZoom: (listener: Listener): (() => void) => listen(zoomListeners, listener),
  /** Called when a canvas mounts or unmounts. */
  onAttach: (listener: Listener): (() => void) =>
    listen(attachListeners, listener),
  /**
   * Called for every view change the developer made, being a gesture, a pan
   * or zoom key, the zoom controls, or a click on the canvas, and never for a
   * travel the controller made, such as Show's.
   */
  onHandMove: (listener: Listener): (() => void) =>
    listen(handListeners, listener),
  zoomBy: (factor: number): void => controls?.zoomBy(factor),
  zoomTo: (scale: number): void => controls?.zoomTo(scale),
  fit: (): void => controls?.fit(),
  fitTo: (boxes: readonly Box[]): void => controls?.fitTo(boxes),
  panBy: (dx: number, dy: number): void => controls?.panBy(dx, dy),
  centerOn: (box: Box, scale?: number): void => controls?.centerOn(box, scale),
  /**
   * Centers the box at the current zoom unless it lies wholly inside the
   * view, so a frame half under a panel comes into view too, and a box larger
   * than the view is fitted. The developer asked for it, so it reports as a
   * hand move, which stops Follow.
   */
  reveal: (box: Box): void => {
    if (!controls || contains(controls.visible(), box)) return
    reportHandMove()
    controls.centerOn(box)
  },
}

function contains(outer: Box, inner: Box): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  )
}

/** Called by the canvas of a page on mount, returning the function its unmount calls. */
export function attachCanvas(next: CanvasControls, page: string): () => void {
  controls = next
  attachedPage = page
  notify(attachListeners)
  return () => {
    if (controls !== next) return
    controls = null
    attachedPage = null
    notify(attachListeners)
  }
}

/** Called by the canvas for a view change the developer made. */
export function reportHandMove(): void {
  notify(handListeners)
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
