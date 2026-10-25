import { describe, expect, it } from 'vitest'

import { labelRoom, markCrowded, markHovered } from './label-room'

const at = (ref: string, x: number, y: number, width = 100, height = 100) => ({
  ref,
  box: { x, y, width, height },
})

describe('labelRoom', () => {
  it('measures the gap up to a frame stacked above', () => {
    const rooms = labelRoom([at('top', 0, 0), at('below', 0, 180)])

    expect(rooms.get('below')).toBe(80)
  })

  it('takes the nearest of several frames above', () => {
    const rooms = labelRoom([
      at('far', 0, 0),
      at('near', 50, 150),
      at('below', 0, 300),
    ])

    expect(rooms.get('below')).toBe(50)
  })

  it('counts a frame above that overlaps across in part', () => {
    const rooms = labelRoom([at('offset', 90, 0), at('below', 0, 140)])

    expect(rooms.get('below')).toBe(40)
  })

  it('leaves a frame beside the column out', () => {
    const rooms = labelRoom([at('beside', 120, 0), at('below', 0, 140)])

    expect(rooms.get('below')).toBe(Infinity)
  })

  it('gives a lone frame unbounded room', () => {
    expect(labelRoom([at('lone', 0, 0)]).get('lone')).toBe(Infinity)
  })

  it('gives no room under a frame overlapping its top', () => {
    const rooms = labelRoom([at('over', 0, 0), at('under', 20, 60)])

    expect(rooms.get('under')).toBe(0)
  })
})

function layerOf(...refs: string[]): HTMLElement {
  const layer = document.createElement('div')
  for (const ref of refs) {
    const element = document.createElement('div')
    element.dataset.frame = ref
    layer.append(element)
  }
  return layer
}

const marked = (layer: HTMLElement, attribute: string) =>
  [...layer.querySelectorAll<HTMLElement>(`[${attribute}]`)].map(
    (element) => element.dataset.frame,
  )

describe('markCrowded', () => {
  const rooms = new Map([
    ['top', Infinity],
    ['below', 80],
  ])

  it('marks a frame whose gap is shorter than the label at the zoom', () => {
    const layer = layerOf('top', 'below')

    markCrowded(layer, rooms, 0.19)

    expect(marked(layer, 'data-label-crowded')).toEqual(['below'])
  })

  it('clears the mark once the zoom gives the label room', () => {
    const layer = layerOf('top', 'below')
    markCrowded(layer, rooms, 0.19)

    markCrowded(layer, rooms, 1)

    expect(marked(layer, 'data-label-crowded')).toEqual([])
  })
})

describe('markHovered', () => {
  it('moves the hover mark to the frame under the pointer', () => {
    const layer = layerOf('a', 'b')
    markHovered(layer, 'a')

    markHovered(layer, 'b')

    expect(marked(layer, 'data-label-hover')).toEqual(['b'])
  })
})
