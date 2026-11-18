import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { recordingJournal } from '../../../test/support/recording-journal'
import { type TempBoard, writeBoard } from '../../../test/support/temp-board'
import { removeKit } from './remove'

const FRAME = '<!doctype html>\n<title>Frame</title>\n'

/** A project with two kits, `sketch` named by a frame on each page and `clean` by one. */
function project(): Record<string, string> {
  return {
    'acme/project.json': '{ "version": 1, "pages": ["home", "pricing"] }\n',
    'acme/home/hero.html': FRAME,
    'acme/home/plain.html': FRAME,
    'acme/home/tidy.html': FRAME,
    'acme/home/layout.json': layoutOf({
      hero: { x: 0, y: 0, width: 400, height: 300, order: 0, kit: 'sketch' },
      plain: { x: 500, y: 0, width: 400, height: 300, order: 1 },
      tidy: { x: 1000, y: 0, width: 400, height: 300, order: 2, kit: 'clean' },
    }),
    'acme/pricing/plans.html': FRAME,
    'acme/pricing/layout.json': layoutOf({
      plans: { x: 0, y: 0, width: 400, height: 300, order: 0, kit: 'sketch' },
    }),
    'acme/assets/kits/sketch/kit.css': '.kit-card { border: 2px solid }\n',
    'acme/assets/kits/clean/kit.css': '.kit-card { border: 0 }\n',
  }
}

function layoutOf(frames: Record<string, object>): string {
  return `${JSON.stringify({ version: 1, frames }, null, 2)}\n`
}

describe('removeKit', () => {
  let board: TempBoard

  afterEach(() => {
    board.cleanup()
  })

  function frames(page: string): Record<string, { kit?: string }> {
    return JSON.parse(
      readFileSync(join(board.root, `acme/${page}/layout.json`), 'utf8'),
    ).frames
  }

  it('takes the kit folder out and leaves the other kit', async () => {
    board = writeBoard(project())

    await removeKit(board.root, 'acme', 'sketch')

    expect(existsSync(join(board.root, 'acme/assets/kits/sketch'))).toBe(false)
    expect(existsSync(join(board.root, 'acme/assets/kits/clean'))).toBe(true)
  })

  it('clears the kit from every frame naming it, on every page, and answers their refs', async () => {
    board = writeBoard(project())

    const removed = await removeKit(board.root, 'acme', 'sketch')

    expect(removed).toEqual({
      project: 'acme',
      kit: 'sketch',
      frames: ['acme/home/hero', 'acme/pricing/plans'],
    })
    expect(frames('home').hero).not.toHaveProperty('kit')
    expect(frames('pricing').plans).not.toHaveProperty('kit')
  })

  it('leaves a frame naming another kit and a plain frame as they were', async () => {
    board = writeBoard(project())

    await removeKit(board.root, 'acme', 'sketch')

    expect(frames('home').tidy).toEqual({
      x: 1000,
      y: 0,
      width: 400,
      height: 300,
      order: 2,
      kit: 'clean',
    })
    expect(frames('home').plain).toEqual({
      x: 500,
      y: 0,
      width: 400,
      height: 300,
      order: 1,
    })
  })

  it('removes a kit no frame names, answering no frames', async () => {
    board = writeBoard({
      ...project(),
      'acme/assets/kits/unused/kit.css': '',
    })

    const removed = await removeKit(board.root, 'acme', 'unused')

    expect(removed.frames).toEqual([])
    expect(existsSync(join(board.root, 'acme/assets/kits/unused'))).toBe(false)
  })

  it('removes the folder under its own spelling for a name differing in case', async () => {
    board = writeBoard(project())

    const removed = await removeKit(board.root, 'acme', 'Sketch')

    expect(removed.kit).toBe('sketch')
    expect(existsSync(join(board.root, 'acme/assets/kits/sketch'))).toBe(false)
  })

  it('reports the folder and each cleared entry to the journal, so one undo restores both', async () => {
    board = writeBoard(project())
    const { journal, calls } = recordingJournal(board.root)

    await removeKit(board.root, 'acme', 'sketch', { journal })

    expect(calls.map(({ kind }) => kind).sort()).toEqual([
      'entry',
      'entry',
      'removed',
    ])
    expect(calls).toContainEqual({
      kind: 'removed',
      path: 'acme/assets/kits/sketch',
    })
    expect(calls).toContainEqual(
      expect.objectContaining({
        kind: 'entry',
        page: 'acme/pricing',
        frame: 'plans',
        before: expect.objectContaining({ kit: 'sketch' }),
        after: expect.not.objectContaining({ kit: 'sketch' }),
      }),
    )
  })

  it.each([
    ['the project lacks', 'wireframe'],
    ['climbing out of the kits folder', '../../home'],
  ])(
    'refuses kit-not-found for a kit %s and writes nothing',
    async (_c, kit) => {
      board = writeBoard(project())
      const before = readFileSync(
        join(board.root, 'acme/home/layout.json'),
        'utf8',
      )

      await expect(removeKit(board.root, 'acme', kit)).rejects.toMatchObject({
        code: 'kit-not-found',
        details: { project: 'acme', known: ['clean', 'sketch'] },
      })
      expect(
        readFileSync(join(board.root, 'acme/home/layout.json'), 'utf8'),
      ).toBe(before)
      expect(existsSync(join(board.root, 'acme/home'))).toBe(true)
    },
  )

  it('refuses layout-invalid on a page it cannot read, leaving the folder and every frame', async () => {
    board = writeBoard({
      ...project(),
      'acme/pricing/layout.json': '{ not json',
    })

    await expect(removeKit(board.root, 'acme', 'sketch')).rejects.toMatchObject(
      { code: 'layout-invalid' },
    )
    expect(existsSync(join(board.root, 'acme/assets/kits/sketch'))).toBe(true)
    expect(frames('home').hero?.kit).toBe('sketch')
  })
})
