import { afterEach, describe, expect, it } from 'vitest'

import { type TempBoard, writeBoard } from '../../../test/support/temp-board'
import {
  checkTransitionSheet,
  readTransitionSheet,
  transitionFiles,
} from './transition-file'

const ENTER = '@keyframes enter { from { opacity: 0 } to { opacity: 1 } }'
const LEAVE = '@keyframes leave { from { opacity: 1 } to { opacity: 0 } }'

/** The messages a refused sheet named `wipe` reports. */
function problemsOf(css: string, name = 'wipe'): string[] {
  const reading = readTransitionSheet(name, css)
  return reading.ok ? [] : reading.problems.map((problem) => problem.message)
}

describe('readTransitionSheet', () => {
  it('keeps the enter and leave keyframes and nothing around them', () => {
    const reading = readTransitionSheet(
      'wipe',
      `/* a wipe */\n${ENTER}\n${LEAVE}\n`,
    )

    expect(reading).toEqual({
      ok: true,
      enter: 'from { opacity: 0 } to { opacity: 1 }',
      leave: 'from { opacity: 1 } to { opacity: 0 }',
    })
  })

  it('reads a sheet with enter alone as holding no leave', () => {
    expect(readTransitionSheet('wipe', ENTER)).toMatchObject({
      ok: true,
      leave: null,
    })
  })

  it.each([
    ['leave alone', LEAVE, '@keyframes enter is missing'],
    ['an empty sheet', '', '@keyframes enter is missing'],
    [
      'a style rule',
      `${ENTER} body { display: none }`,
      'A style rule (body) sits outside the keyframes',
    ],
    [
      'an import',
      `@import "other.css"; ${ENTER}`,
      '@import is not @keyframes enter or @keyframes leave',
    ],
    [
      'a font face',
      `${ENTER} @font-face { font-family: x }`,
      '@font-face is not @keyframes enter or @keyframes leave',
    ],
    [
      'a third keyframes',
      `${ENTER} @keyframes spin { to { rotate: 1turn } }`,
      '@keyframes spin is not @keyframes enter or @keyframes leave',
    ],
    [
      'a prefixed keyframes',
      `${ENTER} @-webkit-keyframes leave { to { opacity: 0 } }`,
      '@-webkit-keyframes is not @keyframes enter or @keyframes leave',
    ],
    [
      'a second enter',
      `${ENTER} ${ENTER}`,
      '@keyframes enter is written twice',
    ],
    [
      'a url in a keyframe',
      '@keyframes enter { from { background: url(https://example.com/x.png) } }',
      'background holds url(), and a transition loads nothing',
    ],
    [
      'a url in capitals',
      '@keyframes enter { from { background: URL(x.png) } }',
      'background holds url(), and a transition loads nothing',
    ],
    [
      'a quoted string, which image-set() loads from',
      '@keyframes enter { from { background: image-set("x.png" 1x) } }',
      'background holds a quoted string, and a transition loads nothing',
    ],
    [
      'an escape, which can spell url()',
      '@keyframes enter { from { background: u\\72l(x.png) } }',
      'background holds a backslash escape, which can spell url()',
    ],
    [
      'a selector that is no keyframe step',
      '@keyframes enter { body { opacity: 0 } }',
      'body is not a keyframe step such as from, to, or 50%',
    ],
    [
      'an at-rule inside the keyframes',
      '@keyframes enter { @media print { from { opacity: 0 } } }',
      '@media sits inside @keyframes enter',
    ],
    [
      'a sheet postcss refuses',
      '@keyframes enter { from { opacity: 0 }',
      'The stylesheet does not parse: Unclosed block',
    ],
  ])('refuses %s whole', (_, css, message) => {
    expect(readTransitionSheet('wipe', css).ok).toBe(false)
    expect(problemsOf(css)).toContain(message)
  })

  it.each(['fade', 'none', 'page', 'Wipe Up'])(
    'refuses a clean sheet named %s by its name',
    (name) => {
      expect(problemsOf(ENTER, name)).toEqual([
        `${name} is no transition name. Name the file in lowercase kebab case, and not after a built-in transition, none, or page`,
      ])
    },
  )

  it('names every stray in one reading', () => {
    expect(
      problemsOf(`a { color: red } @import "x.css"; ${ENTER}`),
    ).toHaveLength(2)
  })
})

describe('checkTransitionSheet', () => {
  it('reports a stray at its place in the file as an error on no frame', () => {
    const findings = checkTransitionSheet(
      { project: 'site', name: 'wipe' },
      `${ENTER}\nbody { display: none }`,
    )

    expect(findings).toEqual([
      {
        rule: 'transition-file',
        severity: 'error',
        frame: null,
        path: 'site/assets/transitions/wipe.css',
        message: 'A style rule (body) sits outside the keyframes',
        location: { line: 2, column: 1, startOffset: 59, endOffset: 81 },
      },
    ])
  })

  it('reports nothing for a clean sheet', () => {
    expect(
      checkTransitionSheet({ project: 'site', name: 'wipe' }, ENTER),
    ).toEqual([])
  })
})

describe('transitionFiles', () => {
  let board: TempBoard | undefined

  afterEach(() => {
    board?.cleanup()
    board = undefined
  })

  it('lists the stylesheets in the folder by name, whatever each is named', async () => {
    board = writeBoard({
      'site/assets/transitions/wipe.css': ENTER,
      'site/assets/transitions/Wipe Up.css': ENTER,
      'site/assets/transitions/notes.txt': 'x',
      'site/assets/transitions/.hidden.css': ENTER,
      'site/assets/transitions/nested/deep.css': ENTER,
      'site/assets/other.css': ENTER,
    })

    const files = await transitionFiles(`${board.root}/site`)

    expect(files.map((file) => file.name)).toEqual(['Wipe Up', 'wipe'])
    expect(files[1]?.path).toBe(
      `${board.root}/site/assets/transitions/wipe.css`,
    )
  })

  it('lists none for a project with no transitions folder', async () => {
    board = writeBoard({ 'site/assets/shared.css': '' })

    expect(await transitionFiles(`${board.root}/site`)).toEqual([])
  })
})
