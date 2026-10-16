import { afterEach, describe, expect, it } from 'vitest'

import { type TempBoard, writeBoard } from '../../../test/support/temp-board'
import { buildCascade } from './cascade'
import { readFrame } from './frame-source'
import { checkUppercase } from './uppercase'

let board: TempBoard | undefined

afterEach(() => {
  board?.cleanup()
  board = undefined
})

function uppercaseOf(html: string) {
  board = writeBoard({ 'site/home/hero.html': html })
  const source = readFrame({
    root: board.root,
    project: 'site',
    page: 'home',
    name: 'hero',
  })
  return checkUppercase(source, buildCascade(source, []))
}

describe('checkUppercase', () => {
  it('reports text an inherited text-transform capitalizes', () => {
    expect(
      uppercaseOf(
        '<style>nav { text-transform: uppercase }</style><nav><a>Home</a></nav>',
      ),
    ).toMatchObject([{ rule: 'uppercase', location: { line: 1 } }])
  })

  it('reports a word written in four capitals', () => {
    expect(uppercaseOf('<p>Read the GUIDE first</p>')).toMatchObject([
      { rule: 'uppercase' },
    ])
  })

  it('passes a three-letter acronym and sentence case', () => {
    expect(uppercaseOf('<p>The API returns data</p>')).toEqual([])
  })

  it('passes text a rule sets back to none', () => {
    expect(
      uppercaseOf(
        '<style>nav { text-transform: uppercase } a { text-transform: none }</style><nav><a>Home</a></nav>',
      ),
    ).toEqual([])
  })
})
