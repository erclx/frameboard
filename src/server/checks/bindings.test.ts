import { afterEach, describe, expect, it } from 'vitest'

import { type TempBoard, writeBoard } from '../../../test/support/temp-board'
import { checkBindings } from './bindings'
import { readFrame } from './frame-source'

let board: TempBoard | undefined

afterEach(() => {
  board?.cleanup()
  board = undefined
})

/** The findings of the tuner frame on page `home`. */
function bindingsOf(html: string) {
  board = writeBoard({ 'site/home/tuner.html': html })
  return checkBindings(
    readFrame({
      root: board.root,
      project: 'site',
      page: 'home',
      name: 'tuner',
    }),
  )
}

describe('checkBindings', () => {
  it('passes a control whose selector matches its target', () => {
    const findings = bindingsOf(
      '<img id="photo"><input type="range" data-binds="#photo --brightness">',
    )

    expect(findings).toEqual([])
  })

  it('reports a selector an agent renamed away, at its attribute', () => {
    const findings = bindingsOf(
      '<img id="hero-image">\n<input type="range" data-binds="#photo --contrast">',
    )

    expect(findings).toMatchObject([
      {
        rule: 'binding-target',
        severity: 'warning',
        frame: 'site/home/tuner',
        path: 'site/home/tuner.html',
        location: { line: 2, column: 21 },
      },
    ])
  })

  it('reports a property that is not custom', () => {
    const findings = bindingsOf(
      '<img id="photo"><input type="range" data-binds="#photo opacity">',
    )

    expect(findings).toMatchObject([{ rule: 'binding-target' }])
  })

  it('reports a value naming a property alone', () => {
    const findings = bindingsOf('<input type="range" data-binds="--blur">')

    expect(findings).toMatchObject([{ rule: 'binding-target' }])
  })

  it('reports a selector that does not parse', () => {
    const findings = bindingsOf(
      '<img id="photo"><input type="range" data-binds="#photo[ --blur">',
    )

    expect(findings).toMatchObject([{ rule: 'binding-target' }])
  })

  it('reports each broken control on its own', () => {
    const findings = bindingsOf(
      '<input data-binds="#photo --a"><input data-binds="#photo --b"><input data-binds="#photo --c">',
    )

    expect(findings).toHaveLength(3)
  })

  it('passes a descendant selector holding a space', () => {
    const findings = bindingsOf(
      '<figure class="card"><img></figure><input type="range" data-binds=".card img --blur">',
    )

    expect(findings).toEqual([])
  })
})
