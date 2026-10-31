import { afterEach, describe, expect, it } from 'vitest'

import { buildCascade } from '@/server/checks/cascade'
import { readFrame } from '@/server/checks/frame-source'

import { type TempBoard, writeBoard } from '../../../test/support/temp-board'
import { FLOW_PROPERTIES, flowOf } from './flow'

let board: TempBoard | undefined

afterEach(() => {
  board?.cleanup()
  board = undefined
})

/** The flow of the element with `id` in a frame whose body holds `body`. */
function flowAt(body: string, id: string) {
  board = writeBoard({
    'site/home/hero.html': `<!doctype html><html><head></head><body>${body}</body></html>`,
  })
  const source = readFrame({
    root: board.root,
    project: 'site',
    page: 'home',
    name: 'hero',
  })
  const element = source.elements.find(
    (candidate) => candidate.attribs.id === id,
  )
  if (!element) throw new Error(`no element #${id}`)
  return flowOf(
    buildCascade(source, [], { properties: FLOW_PROPERTIES }),
    element,
  )
}

const NINE_ROWS =
  '<div class="row" id="t"></div>' + '<div class="row"></div>'.repeat(8)

describe('flowOf rule', () => {
  it('names a shared flex rule and the nine rows it matches', () => {
    const { rule } = flowAt(
      `<style>.row { display: flex; gap: 8px }</style>${NINE_ROWS}`,
      't',
    )

    expect(rule).toEqual({ selector: '.row', count: 9 })
  })

  it('names the rule a grid comes from', () => {
    const { rule } = flowAt(
      '<style>.cards { display: grid; grid-template-columns: 1fr 1fr }</style><div class="cards" id="t"></div>',
      't',
    )

    expect(rule).toEqual({ selector: '.cards', count: 1 })
  })

  it('names no rule for a flow its own style sets', () => {
    const { rule } = flowAt(
      '<div id="t" style="display: flex"></div><div style="display: flex"></div>',
      't',
    )

    expect(rule).toBeNull()
  })

  it('names no rule for a block, whatever rule styles it', () => {
    const { rule } = flowAt(
      '<style>.card { padding: 8px }</style><div class="card" id="t"></div>',
      't',
    )

    expect(rule).toBeNull()
  })
})

describe('flowOf size', () => {
  it('reads a growing child of a row as Fill along it', () => {
    const { size } = flowAt(
      '<div style="display: flex"><div id="t" style="flex: 1"></div></div>',
      't',
    )

    expect(size.width).toBe('fill')
  })

  it('reads a declared width as Fixed', () => {
    const { size } = flowAt(
      '<div style="display: flex"><div id="t" style="width: 120px"></div></div>',
      't',
    )

    expect(size.width).toBe('fixed')
  })

  it('reads a child of a row with no width or grow as Hug', () => {
    const { size } = flowAt(
      '<div style="display: flex"><div id="t"></div></div>',
      't',
    )

    expect(size.width).toBe('hug')
  })

  it('reads a child stretched across a row as Fill in height', () => {
    const { size } = flowAt(
      '<div style="display: flex"><div id="t"></div></div>',
      't',
    )

    expect(size.height).toBe('fill')
  })

  it('reads a child of a centering row as Hug in height', () => {
    const { size } = flowAt(
      '<div style="display: flex; align-items: center"><div id="t"></div></div>',
      't',
    )

    expect(size.height).toBe('hug')
  })

  it('reads a growing child of a column as Fill in height', () => {
    const { size } = flowAt(
      '<div style="display: flex; flex-direction: column"><div id="t" style="flex: 1 1 0"></div></div>',
      't',
    )

    expect(size).toEqual({ width: 'fill', height: 'fill' })
  })

  it('reads a fixed basis along the row as Fixed', () => {
    const { size } = flowAt(
      '<div style="display: flex"><div id="t" style="flex: 0 0 200px"></div></div>',
      't',
    )

    expect(size.width).toBe('fixed')
  })

  it('offers no Fill under a block parent', () => {
    const { size } = flowAt(
      '<div><div id="t" style="flex: 1"></div></div>',
      't',
    )

    expect(size).toEqual({ width: null, height: 'hug' })
  })

  it('reads fit-content as Hug under a block parent', () => {
    const { size } = flowAt(
      '<div><div id="t" style="width: fit-content"></div></div>',
      't',
    )

    expect(size.width).toBe('hug')
  })
})
