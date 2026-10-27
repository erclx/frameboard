import { afterEach, describe, expect, it } from 'vitest'

import type { Box } from './geometry/box'
import { attachCanvas, type CanvasControls, canvasView } from './view'

const view: Box = { x: 0, y: 0, width: 800, height: 600 }

function fakeCanvas() {
  const centered: Box[] = []
  const controls: CanvasControls = {
    zoomBy: () => {},
    zoomTo: () => {},
    fit: () => {},
    fitTo: () => {},
    panBy: () => {},
    centerOn: (box) => centered.push(box),
    visible: () => view,
  }
  return { controls, centered }
}

let detach = () => {}

afterEach(() => detach())

describe('canvasView.reveal', () => {
  it('leaves the view on a box lying wholly inside it', () => {
    const { controls, centered } = fakeCanvas()
    detach = attachCanvas(controls, 'studio/home')

    canvasView.reveal({ x: 100, y: 100, width: 200, height: 200 })

    expect(centered).toEqual([])
  })

  it('centers a box lying partly outside the view', () => {
    const { controls, centered } = fakeCanvas()
    detach = attachCanvas(controls, 'studio/home')
    const box = { x: -150, y: 100, width: 300, height: 200 }

    canvasView.reveal(box)

    expect(centered).toEqual([box])
  })

  it('centers a box lying wholly outside the view', () => {
    const { controls, centered } = fakeCanvas()
    detach = attachCanvas(controls, 'studio/home')
    const box = { x: 5000, y: 0, width: 200, height: 200 }

    canvasView.reveal(box)

    expect(centered).toEqual([box])
  })

  it('centers a box larger than the view', () => {
    const { controls, centered } = fakeCanvas()
    detach = attachCanvas(controls, 'studio/home')
    const box = { x: -100, y: -100, width: 1200, height: 900 }

    canvasView.reveal(box)

    expect(centered).toEqual([box])
  })

  it('reports a reveal that moves the view as a hand move', () => {
    const { controls } = fakeCanvas()
    detach = attachCanvas(controls, 'studio/home')
    let handMoves = 0
    const stop = canvasView.onHandMove(() => (handMoves += 1))

    canvasView.reveal({ x: 700, y: 100, width: 200, height: 200 })
    stop()

    expect(handMoves).toBe(1)
  })
})
