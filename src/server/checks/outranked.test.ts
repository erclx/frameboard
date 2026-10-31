import { afterEach, describe, expect, it } from 'vitest'

import { type TempBoard, writeBoard } from '../../../test/support/temp-board'
import { frameFrom, readFrame } from './frame-source'
import { checkOutranked } from './outranked'

let board: TempBoard | undefined

afterEach(() => {
  board?.cleanup()
  board = undefined
})

/** The rule over `before`, the bytes a write replaced, and `after` on disk. */
function outrankedOf(before: string, after: string) {
  board = writeBoard({ 'site/home/hero.html': after })
  const target = {
    root: board.root,
    project: 'site',
    page: 'home',
    name: 'hero',
  }
  return checkOutranked(frameFrom(target, before), readFrame(target))
}

const HAND_GAP =
  '<div class="row" style="gap: 24px"><p>a</p></div><div class="row"><p>b</p></div>'

describe('checkOutranked', () => {
  it('warns when a changed rule meets an unchanged inline value', () => {
    expect(
      outrankedOf(
        `<style>.row { gap: 8px }</style>${HAND_GAP}`,
        `<style>.row { gap: 12px }</style>${HAND_GAP}`,
      ),
    ).toEqual([
      expect.objectContaining({
        rule: 'outranked',
        severity: 'warning',
        frame: 'site/home/hero',
        path: 'site/home/hero.html',
        message: expect.stringContaining('<div> at element 4 sets gap'),
      }),
    ])
  })

  it('passes a write that left the rule unchanged', () => {
    expect(
      outrankedOf(
        `<style>.row { gap: 8px }</style>${HAND_GAP}`,
        `<style>.row { gap: 8px } p { color: red }</style>${HAND_GAP}`,
      ),
    ).toEqual([])
  })

  it('warns for a longhand a changed shorthand covers', () => {
    const card = '<div class="card" style="padding-left: 4px"></div>'
    expect(
      outrankedOf(
        `<style>.card { padding: 8px }</style>${card}`,
        `<style>.card { padding: 16px }</style>${card}`,
      ),
    ).toMatchObject([{ message: expect.stringContaining('sets padding-left') }])
  })

  it('passes an inline value the same write added', () => {
    expect(
      outrankedOf(
        '<style>.row { gap: 8px }</style><div class="row"></div>',
        '<style>.row { gap: 12px }</style><div class="row" style="gap: 24px"></div>',
      ),
    ).toEqual([])
  })

  it('passes a changed rule that no longer matches the element', () => {
    expect(
      outrankedOf(
        '<style>.row { gap: 8px }</style><div class="row" style="gap: 24px"></div>',
        '<style>.row { gap: 12px }</style><div class="col" style="gap: 24px"></div>',
      ),
    ).toEqual([])
  })

  it('passes a changed important rule a normal inline value loses to', () => {
    expect(
      outrankedOf(
        '<style>.row { gap: 8px }</style><div class="row" style="gap: 24px"></div>',
        '<style>.row { gap: 12px !important }</style><div class="row" style="gap: 24px"></div>',
      ),
    ).toEqual([])
  })

  it('names how many more elements keep an inline value', () => {
    const rows =
      '<div class="row" style="gap: 1px"></div><div class="row" style="gap: 2px"></div>'
    expect(
      outrankedOf(
        `<style>.row { gap: 8px }</style>${rows}`,
        `<style>.row { gap: 12px }</style>${rows}`,
      ),
    ).toMatchObject([
      { message: expect.stringContaining('and 1 more element') },
    ])
  })
})
