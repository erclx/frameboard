import { afterEach, describe, expect, it } from 'vitest'

import type { ProjectChecks } from '@/shared/records/board'

import { type TempBoard, writeBoard } from '../../../test/support/temp-board'
import { buildCascade } from './cascade'
import { checkFonts } from './fonts'
import { readFrame } from './frame-source'

let board: TempBoard | undefined

afterEach(() => {
  board?.cleanup()
  board = undefined
})

function fontsOf(html: string, config: ProjectChecks = {}) {
  board = writeBoard({ 'site/home/hero.html': html })
  const source = readFrame({
    root: board.root,
    project: 'site',
    page: 'home',
    name: 'hero',
  })
  return checkFonts(source, buildCascade(source, []), config)
}

describe('checkFonts', () => {
  it('reports text in the default font once, at the first element', () => {
    const findings = fontsOf('<body>\n<h1>Title</h1>\n<p>Body</p>\n</body>')

    expect(findings).toMatchObject([
      {
        rule: 'default-font',
        frame: 'site/home/hero',
        location: { line: 2, column: 1 },
      },
    ])
    expect(findings[0]?.message).toContain('2 elements, first <h1> at line 2')
  })

  it('passes text whose family a rule names', () => {
    expect(
      fontsOf('<style>body { font-family: Geist, sans-serif }</style><p>x</p>'),
    ).toEqual([])
  })

  it('reports a generic first family once per family', () => {
    const findings = fontsOf(
      '<style>body { font-family: sans-serif } .m { font-family: monospace }</style><p>x</p><p>y</p><p class="m">z</p>',
    )

    expect(findings.map((finding) => finding.message)).toEqual([
      expect.stringContaining('generic family sans-serif'),
      expect.stringContaining('generic family monospace'),
    ])
  })

  it('ignores whitespace-only elements and the title', () => {
    expect(
      fontsOf('<head><title>Title</title></head><body><div>  </div></body>'),
    ).toEqual([])
  })

  it('reports a family outside the allowed fonts', () => {
    const findings = fontsOf(
      '<style>body { font-family: Geist } .x { font-family: Inter }</style><p>a</p><p class="x">b</p>',
      { allowedFonts: ['geist'] },
    )

    expect(findings).toMatchObject([
      { rule: 'allowed-fonts', message: expect.stringContaining('Inter') },
    ])
  })

  it('leaves allowed fonts off without the config', () => {
    expect(
      fontsOf('<style>body { font-family: Inter }</style><p>a</p>'),
    ).toEqual([])
  })
})
