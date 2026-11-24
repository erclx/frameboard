import { rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { scanBoard } from '@/server/board/scan'
import type { Finding } from '@/shared/records/check'
import type { ListResult } from '@/shared/records/list'

import { type TempBoard, writeBoard } from '../../../test/support/temp-board'
import {
  type BoardFindings,
  createBoardFindings,
  recheckRefs,
} from './findings'

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

function checkAll(findings: BoardFindings, scanned: ListResult) {
  return findings.update(
    scanned,
    scanned.projects
      .flatMap((project) => project.pages)
      .flatMap((page) => page.frames)
      .map((frame) => frame.ref),
  )
}

describe('createBoardFindings', () => {
  it('checks every frame on a full update', async () => {
    board = writeBoard({
      'site/home/hero.html': UNSTYLED,
      'site/home/about.html': CLEAN,
    })
    const findings = createBoardFindings(board.root)

    checkAll(findings, await scanBoard(board.root))

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
    checkAll(findings, await scanBoard(board.root))
    const hero = join(board.root, 'site/home/hero.html')
    writeFileSync(hero, CLEAN)

    const changed = findings.update(await scanBoard(board.root), [
      'site/home/hero',
    ])

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
    checkAll(findings, await scanBoard(board.root))
    const about = join(board.root, 'site/home/about.html')
    rmSync(about)

    findings.update(await scanBoard(board.root), ['site/home/about'])

    expect(Object.keys(findings.all())).toEqual(['site/home/hero'])
  })
})

describe('change findings', () => {
  const outranked = (message: string): Finding => ({
    rule: 'outranked',
    severity: 'warning',
    frame: 'site/home/hero',
    path: 'site/home/hero.html',
    message,
    location: null,
  })

  it('merges a held change finding after the static ones', async () => {
    board = writeBoard({ 'site/home/hero.html': UNSTYLED })
    const findings = createBoardFindings(board.root)
    checkAll(findings, await scanBoard(board.root))

    const sent = findings.setChanged('site/home/hero', [outranked('first')])

    expect(rulesOf(sent)).toEqual({
      'site/home/hero': ['default-font', 'outranked'],
    })
  })

  it('keeps it across a recheck until the next agent write replaces it', async () => {
    board = writeBoard({ 'site/home/hero.html': UNSTYLED })
    const findings = createBoardFindings(board.root)
    checkAll(findings, await scanBoard(board.root))
    findings.setChanged('site/home/hero', [outranked('first')])
    const hero = join(board.root, 'site/home/hero.html')
    writeFileSync(hero, CLEAN)
    findings.update(await scanBoard(board.root), ['site/home/hero'])
    expect(rulesOf(findings.all())).toEqual({ 'site/home/hero': ['outranked'] })

    findings.setChanged('site/home/hero', [])

    expect(findings.all()).toEqual({ 'site/home/hero': [] })
  })

  it('drops it with a frame the board no longer holds', async () => {
    board = writeBoard({
      'site/home/hero.html': UNSTYLED,
      'site/home/about.html': UNSTYLED,
    })
    const findings = createBoardFindings(board.root)
    checkAll(findings, await scanBoard(board.root))
    findings.setChanged('site/home/hero', [outranked('first')])
    const hero = join(board.root, 'site/home/hero.html')
    rmSync(hero)

    findings.update(await scanBoard(board.root), ['site/home/hero'])

    expect(findings.changed(['site/home/hero'])).toEqual({
      'site/home/hero': [],
    })
  })
})

describe('a rule turned off', () => {
  const outranked: Finding = {
    rule: 'outranked',
    severity: 'warning',
    frame: 'site/home/hero',
    path: 'site/home/hero.html',
    message: 'first',
    location: null,
  }
  const clipped: Finding = { ...outranked, rule: 'clipped', severity: 'error' }

  function writeChecks(root: string, checks: unknown) {
    const file = join(root, 'site/project.json')
    writeFileSync(file, JSON.stringify({ version: 1, pages: ['home'], checks }))
  }

  it('takes a held change finding out of the merged list and puts it back when turned on', async () => {
    board = writeBoard({ 'site/home/hero.html': CLEAN })
    const findings = createBoardFindings(board.root)
    checkAll(findings, await scanBoard(board.root))
    findings.setChanged('site/home/hero', [outranked])

    writeChecks(board.root, { off: ['outranked'] })
    const off = checkAll(findings, await scanBoard(board.root))
    const heldOff = findings.changed(['site/home/hero'])
    writeChecks(board.root, {})
    const on = checkAll(findings, await scanBoard(board.root))

    expect(off).toEqual({ 'site/home/hero': [] })
    expect(heldOff).toEqual({ 'site/home/hero': [] })
    expect(rulesOf(on)).toEqual({ 'site/home/hero': ['outranked'] })
  })

  it('takes a held browser finding out the same way', async () => {
    board = writeBoard({ 'site/home/hero.html': CLEAN })
    const findings = createBoardFindings(board.root)
    checkAll(findings, await scanBoard(board.root))
    findings.setRendered('site/home/hero', [clipped])

    writeChecks(board.root, { off: ['clipped'] })
    const off = checkAll(findings, await scanBoard(board.root))

    expect(off).toEqual({ 'site/home/hero': [] })
    expect(findings.rendered(['site/home/hero'])).toEqual({
      'site/home/hero': [],
    })
  })

  it('keeps the rule on in a project that never turned it off', async () => {
    board = writeBoard({
      'site/home/hero.html': CLEAN,
      'docs/home/hero.html': CLEAN,
    })
    const findings = createBoardFindings(board.root)
    checkAll(findings, await scanBoard(board.root))
    findings.setChanged('docs/home/hero', [
      { ...outranked, frame: 'docs/home/hero', path: 'docs/home/hero.html' },
    ])

    writeChecks(board.root, { off: ['outranked'] })
    findings.update(await scanBoard(board.root), ['site/home/hero'])

    expect(rulesOf(findings.all())).toEqual({
      'site/home/hero': [],
      'docs/home/hero': ['outranked'],
    })
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
    checkAll(findings, await scanBoard(board.root))

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
    checkAll(findings, await scanBoard(board.root))
    findings.setRendered('site/home/hero', [CLIPPED])
    const hero = join(board.root, 'site/home/hero.html')
    writeFileSync(hero, CLEAN)

    const changed = findings.update(await scanBoard(board.root), [
      'site/home/hero',
    ])

    expect(rulesOf(changed)).toEqual({ 'site/home/hero': ['clipped'] })
  })

  it('holds a frame checked ahead of its static findings and sends it with them', async () => {
    board = writeBoard({ 'site/home/hero.html': CLEAN })
    const findings = createBoardFindings(board.root)

    const early = findings.setRendered('site/home/hero', [CLIPPED])
    const changed = checkAll(findings, await scanBoard(board.root))

    expect(early).toEqual({})
    expect(rulesOf(changed)).toEqual({ 'site/home/hero': ['clipped'] })
  })

  it('drops the browser findings of a frame the board no longer holds', async () => {
    board = writeBoard({
      'site/home/hero.html': CLEAN,
      'site/home/about.html': CLEAN,
    })
    const findings = createBoardFindings(board.root)
    checkAll(findings, await scanBoard(board.root))
    findings.setRendered('site/home/about', [CLIPPED])
    const about = join(board.root, 'site/home/about.html')
    rmSync(about)

    findings.update(await scanBoard(board.root), ['site/home/about'])

    expect(findings.rendered(['site/home/about'])).toEqual({
      'site/home/about': [],
    })
  })

  it('answers the held browser findings, an unchecked frame as empty', async () => {
    board = writeBoard({
      'site/home/hero.html': CLEAN,
      'site/home/about.html': CLEAN,
    })
    const findings = createBoardFindings(board.root)
    checkAll(findings, await scanBoard(board.root))
    findings.setRendered('site/home/hero', [CLIPPED])

    expect(
      rulesOf(findings.rendered(['site/home/hero', 'site/home/about'])),
    ).toEqual({ 'site/home/hero': ['clipped'], 'site/home/about': [] })
  })
})

describe('remembered findings', () => {
  const FOUND: Finding = {
    rule: 'default-font',
    severity: 'warning',
    frame: 'site/home/hero',
    path: 'site/home/hero.html',
    message: 'From the last server.',
    location: null,
  }
  const CLIPPED: Finding = { ...FOUND, rule: 'clipped', severity: 'error' }
  const STORED = {
    'site/home/hero': {
      checks: { key: 'own', findings: [FOUND] },
      rendered: { key: 'drawn', findings: [CLIPPED] },
    },
  }

  it('answers a hello for a primed frame with no check', async () => {
    board = writeBoard({ 'site/home/hero.html': CLEAN })
    const findings = createBoardFindings(board.root)

    findings.prime(await scanBoard(board.root), STORED)

    expect(findings.all()).toEqual({ 'site/home/hero': [FOUND, CLIPPED] })
    expect(findings.rendered(['site/home/hero'])).toEqual({
      'site/home/hero': [CLIPPED],
    })
  })

  it('replaces a primed frame on its recheck', async () => {
    board = writeBoard({ 'site/home/hero.html': CLEAN })
    const findings = createBoardFindings(board.root)
    const scanned = await scanBoard(board.root)
    findings.prime(scanned, STORED)

    findings.update(
      scanned,
      ['site/home/hero'],
      new Map([['site/home/hero', 'newer']]),
    )
    findings.setRendered('site/home/hero', [], 'redrawn')

    expect(findings.all()).toEqual({ 'site/home/hero': [] })
    expect(findings.kept()).toEqual({
      'site/home/hero': {
        checks: { key: 'newer', findings: [] },
        rendered: { key: 'redrawn', findings: [] },
      },
    })
  })

  it('keeps no result landing without a key, in place of the one it replaced', async () => {
    board = writeBoard({ 'site/home/hero.html': CLEAN })
    const findings = createBoardFindings(board.root)
    const scanned = await scanBoard(board.root)
    findings.prime(scanned, STORED)

    findings.setRendered('site/home/hero', [])

    expect(findings.kept()).toEqual({
      'site/home/hero': { checks: STORED['site/home/hero'].checks },
    })
  })

  it('drops a stored frame the board no longer holds', async () => {
    board = writeBoard({ 'site/home/renamed.html': CLEAN })
    const findings = createBoardFindings(board.root)

    findings.prime(await scanBoard(board.root), STORED)

    expect(findings.all()).toEqual({})
    expect(findings.kept()).toEqual({})
  })

  it('leaves out a rule its project turns off with no frame rechecked', async () => {
    board = writeBoard({
      'site/project.json':
        '{ "version": 1, "pages": [], "checks": { "off": ["outranked"] } }',
      'site/home/hero.html': CLEAN,
    })
    const findings = createBoardFindings(board.root)
    findings.prime(await scanBoard(board.root), STORED)

    const sent = findings.setChanged('site/home/hero', [
      { ...FOUND, rule: 'outranked' },
    ])

    expect(rulesOf(sent)).toEqual({
      'site/home/hero': ['default-font', 'clipped'],
    })
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
