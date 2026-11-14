import { afterEach, describe, expect, it } from 'vitest'

import { FrameboardError } from '@/shared/errors'

import { type TempBoard, writeBoard } from '../../../test/support/temp-board'
import {
  assertKnownTransition,
  listTransitions,
  ownKeyframes,
} from './transitions'

const ENTER = '@keyframes enter { from { opacity: 0 } to { opacity: 1 } }'
const LEAVE = '@keyframes leave { to { opacity: 0 } }'

let board: TempBoard | undefined

afterEach(() => {
  board?.cleanup()
  board = undefined
})

describe('listTransitions', () => {
  it('lists each valid file by name with the inside of its keyframes', async () => {
    board = writeBoard({
      'site/assets/transitions/wipe.css': `${ENTER}\n${LEAVE}`,
      'site/assets/transitions/curtain.css': ENTER,
    })

    expect(await listTransitions(`${board.root}/site`)).toEqual([
      {
        name: 'curtain',
        enter: 'from { opacity: 0 } to { opacity: 1 }',
        leave: null,
      },
      {
        name: 'wipe',
        enter: 'from { opacity: 0 } to { opacity: 1 }',
        leave: 'to { opacity: 0 }',
      },
    ])
  })

  it.each([
    [
      'holding a stray beside valid keyframes',
      'wipe',
      `${ENTER} a { color: red }`,
    ],
    ['holding leave alone', 'wipe', LEAVE],
    ['named after a built-in', 'fade', ENTER],
    ['named in capitals', 'Wipe Up', ENTER],
  ])('leaves out a file %s', async (_, name, css) => {
    board = writeBoard({
      [`site/assets/transitions/${name}.css`]: css,
      'site/assets/transitions/curtain.css': ENTER,
    })

    const listed = await listTransitions(`${board.root}/site`)

    expect(listed.map((transition) => transition.name)).toEqual(['curtain'])
  })

  it('leaves a refused file out with its rule turned off', async () => {
    board = writeBoard({
      'site/assets/transitions/wipe.css': `${ENTER} a { color: red }`,
      'site/project.json': JSON.stringify({
        version: 1,
        pages: [],
        checks: { off: ['transition-file'] },
      }),
    })

    expect(await listTransitions(`${board.root}/site`)).toEqual([])
  })

  it('lists none for a project with no transitions folder', async () => {
    board = writeBoard({ 'site/home/hero.html': '<p>x</p>' })

    expect(await listTransitions(`${board.root}/site`)).toEqual([])
  })
})

describe('ownKeyframes', () => {
  it('writes both keyframes under names carrying the project', () => {
    expect(
      ownKeyframes('site', {
        name: 'wipe',
        enter: 'from { opacity: 0 }',
        leave: 'to { opacity: 0 }',
      }),
    ).toBe(
      '@keyframes fb-own-site--wipe-enter { from { opacity: 0 } }\n@keyframes fb-own-site--wipe-leave { to { opacity: 0 } }',
    )
  })

  it('writes enter alone for a transition holding no leave', () => {
    expect(
      ownKeyframes('site', {
        name: 'wipe',
        enter: 'from { opacity: 0 }',
        leave: null,
      }),
    ).toBe('@keyframes fb-own-site--wipe-enter { from { opacity: 0 } }')
  })
})

describe('assertKnownTransition', () => {
  it('passes a built-in, a name the project holds, and a clear', async () => {
    board = writeBoard({ 'site/assets/transitions/wipe.css': ENTER })
    const projectDir = `${board.root}/site`

    await expect(
      Promise.all([
        assertKnownTransition(projectDir, { name: 'fade' }),
        assertKnownTransition(projectDir, { name: 'wipe', ms: 300 }),
        assertKnownTransition(projectDir, null),
      ]),
    ).resolves.toBeDefined()
  })

  it('refuses a name the project does not hold, naming the ones it does', async () => {
    board = writeBoard({ 'site/assets/transitions/wipe.css': ENTER })

    const refusal = await assertKnownTransition(`${board.root}/site`, {
      name: 'curtain',
    }).catch((error: unknown) => error)

    expect(refusal).toBeInstanceOf(FrameboardError)
    expect(refusal).toMatchObject({
      code: 'usage',
      details: {
        transition: 'curtain',
        known: [
          'none',
          'fade',
          'slide',
          'push',
          'zoom',
          'flip',
          'dissolve',
          'wipe',
        ],
      },
    })
  })

  it("refuses a direction on a transition of the project's own", async () => {
    board = writeBoard({ 'site/assets/transitions/wipe.css': ENTER })

    await expect(
      assertKnownTransition(`${board.root}/site`, {
        name: 'wipe',
        direction: 'up',
      }),
    ).rejects.toMatchObject({ code: 'usage' })
  })
})
