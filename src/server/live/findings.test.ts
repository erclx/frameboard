import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { scanBoard } from '@/server/board/scan'
import type { Finding } from '@/shared/records/check'

import { type TempBoard, writeBoard } from '../../../test/support/temp-board'
import { createBoardFindings, recheckRefs } from './findings'

const CLEAN = '<style>body { font-family: Geist }</style><p>Hello</p>'
const UNSTYLED = '<p>Hello</p>'

let board: TempBoard | undefined

afterEach(() => {
  board?.cleanup()
  board = undefined
})

function rulesOf(findings: Record<string, { rule: string }[]>) {
  return Object.fromEntries(
    Object.entries(findings).map(([ref, list]) => [
      ref,
      list.map((finding) => finding.rule),
    ]),
  )
}

describe('createBoardFindings', () => {
  it('checks every frame on a full update', async () => {
    board = writeBoard({
      'site/home/hero.html': UNSTYLED,
      'site/home/about.html': CLEAN,
    })
    const findings = createBoardFindings(board.root)

    findings.update(await scanBoard(board.root), 'all')

    expect(rulesOf(findings.all())).toEqual({
      'site/home/about': [],
      'site/home/hero': ['default-font'],
    })
  })

  it('returns only the frames a batch changed, a fixed one as empty', async () => {
    board = writeBoard({
      'site/home/hero.html': UNSTYLED,
      'site/home/about.html': UNSTYLED,
    })
    const findings = createBoardFindings(board.root)
    findings.update(await scanBoard(board.root), 'all')
    const hero = join(board.root, 'site/home/hero.html')
    writeFileSync(hero, CLEAN)

    const changed = findings.update(await scanBoard(board.root), [hero])

    expect(changed).toEqual({ 'site/home/hero': [] })
    expect(rulesOf(findings.all())).toEqual({
      'site/home/hero': [],
      'site/home/about': ['default-font'],
    })
  })

  it('drops a frame the board no longer holds', async () => {
    board = writeBoard({
      'site/home/hero.html': UNSTYLED,
      'site/home/about.html': UNSTYLED,
    })
    const findings = createBoardFindings(board.root)
    findings.update(await scanBoard(board.root), 'all')
    const about = join(board.root, 'site/home/about.html')
    rmSync(about)

    findings.update(await scanBoard(board.root), [about])

    expect(Object.keys(findings.all())).toEqual(['site/home/hero'])
  })
})

describe('browser findings', () => {
  const CLIPPED: Finding = {
    rule: 'clipped',
    severity: 'error',
    frame: 'site/home/hero',
    path: 'site/home/hero.html',
    message: 'site/home/hero is cut off.',
    location: null,
  }

  it('sends a frame its static and browser findings merged', async () => {
    board = writeBoard({ 'site/home/hero.html': UNSTYLED })
    const findings = createBoardFindings(board.root)
    findings.update(await scanBoard(board.root), 'all')

    const changed = findings.setRendered('site/home/hero', [CLIPPED])

    expect(rulesOf(changed)).toEqual({
      'site/home/hero': ['default-font', 'clipped'],
    })
    expect(rulesOf(findings.all())).toEqual({
      'site/home/hero': ['default-font', 'clipped'],
    })
  })

  it('keeps the browser findings through a static recheck', async () => {
    board = writeBoard({ 'site/home/hero.html': UNSTYLED })
    const findings = createBoardFindings(board.root)
    findings.update(await scanBoard(board.root), 'all')
    findings.setRendered('site/home/hero', [CLIPPED])
    const hero = join(board.root, 'site/home/hero.html')
    writeFileSync(hero, CLEAN)

    const changed = findings.update(await scanBoard(board.root), [hero])

    expect(rulesOf(changed)).toEqual({ 'site/home/hero': ['clipped'] })
  })

  it('holds nothing for a frame the board no longer holds', async () => {
    board = writeBoard({ 'site/home/hero.html': CLEAN })
    const findings = createBoardFindings(board.root)

    const changed = findings.setRendered('site/home/hero', [CLIPPED])

    expect(changed).toEqual({})
    expect(findings.all()).toEqual({})
  })

  it('answers the held browser findings, an unchecked frame as empty', async () => {
    board = writeBoard({
      'site/home/hero.html': CLEAN,
      'site/home/about.html': CLEAN,
    })
    const findings = createBoardFindings(board.root)
    findings.update(await scanBoard(board.root), 'all')
    findings.setRendered('site/home/hero', [CLIPPED])

    expect(
      rulesOf(findings.rendered(['site/home/hero', 'site/home/about'])),
    ).toEqual({ 'site/home/hero': ['clipped'], 'site/home/about': [] })
  })
})

describe('recheckRefs', () => {
  it('rechecks every frame of a page when a sheet beside them changes', async () => {
    board = writeBoard({
      'site/home/hero.html': CLEAN,
      'site/home/about.html': CLEAN,
      'site/blog/post.html': CLEAN,
    })

    const refs = recheckRefs(
      board.root,
      [join(board.root, 'site/home/styles.css')],
      await scanBoard(board.root),
    )

    expect(refs.sort()).toEqual(['site/home/about', 'site/home/hero'])
  })

  it("rechecks a project's frames when its config or token sheet changes", async () => {
    board = writeBoard({
      'site/home/hero.html': CLEAN,
      'other/home/hero.html': CLEAN,
    })
    const scanned = await scanBoard(board.root)

    expect(
      recheckRefs(board.root, [join(board.root, 'site/project.json')], scanned),
    ).toEqual(['site/home/hero'])
    expect(
      recheckRefs(board.root, [join(board.root, 'site/tokens.css')], scanned),
    ).toEqual(['site/home/hero'])
  })

  it('rechecks every frame when the board token sheet changes', async () => {
    board = writeBoard({
      'site/home/hero.html': CLEAN,
      'other/home/hero.html': CLEAN,
    })

    const refs = recheckRefs(
      board.root,
      [join(board.root, 'tokens.css')],
      await scanBoard(board.root),
    )

    expect(refs.sort()).toEqual(['other/home/hero', 'site/home/hero'])
  })

  it('rechecks every frame when the --tokens sheet changes', async () => {
    board = writeBoard({
      'site/home/hero.html': CLEAN,
      'other/home/hero.html': CLEAN,
    })
    const tokens = join(board.root, '../brand.css')

    const refs = recheckRefs(
      board.root,
      [tokens],
      await scanBoard(board.root),
      tokens,
    )

    expect(refs.sort()).toEqual(['other/home/hero', 'site/home/hero'])
  })

  it('rechecks nothing for a layout write', async () => {
    board = writeBoard({ 'site/home/hero.html': CLEAN })

    expect(
      recheckRefs(
        board.root,
        [join(board.root, 'site/home/layout.json')],
        await scanBoard(board.root),
      ),
    ).toEqual([])
  })
})
