import { symlinkSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { type TempBoard, writeBoard } from '../../../test/support/temp-board'
import { readFrame } from './frame-source'
import { checkLinks } from './links'

let board: TempBoard | undefined

afterEach(() => {
  board?.cleanup()
  board = undefined
})

/** The hero frame on page `home`, with `files` written beside it. */
function linksOf(html: string, files: Record<string, string> = {}) {
  board = writeBoard({ 'site/home/hero.html': html, ...files })
  return checkLinks(
    readFrame({
      root: board.root,
      project: 'site',
      page: 'home',
      name: 'hero',
    }),
  )
}

describe('checkLinks', () => {
  it('passes a sheet beside the frame and one in the project assets', () => {
    const findings = linksOf(
      '<link rel="stylesheet" href="local.css"><link rel="stylesheet" href="../assets/shared.css">',
      { 'site/home/local.css': '', 'site/assets/shared.css': '' },
    )

    expect(findings).toEqual([])
  })

  it('reports a sheet in a sibling page folder at its href', () => {
    const findings = linksOf(
      '<p>x</p>\n<link rel="stylesheet" href="../other/x.css">',
      { 'site/other/x.css': '' },
    )

    expect(findings).toMatchObject([
      {
        rule: 'outside-link',
        frame: 'site/home/hero',
        path: 'site/home/hero.html',
        location: { line: 2, column: 24 },
      },
    ])
  })

  it('reports a root-relative src as outside', () => {
    expect(linksOf('<img src="/logo.svg">')).toMatchObject([
      { rule: 'outside-link' },
    ])
  })

  it('reports an assets symlink that leaves the project', () => {
    board = writeBoard({
      'site/home/hero.html': '<img src="../assets/logo.svg">',
      'elsewhere/logo.svg': '<svg/>',
    })
    symlinkSync(join(board.root, 'elsewhere'), join(board.root, 'site/assets'))

    const findings = checkLinks(
      readFrame({
        root: board.root,
        project: 'site',
        page: 'home',
        name: 'hero',
      }),
    )

    expect(findings).toMatchObject([{ rule: 'outside-link' }])
  })

  it('reports a script loaded over the network and a protocol-relative image', () => {
    const findings = linksOf(
      '<script src="https://cdn.example/x.js"></script><img src="//cdn.example/a.png">',
    )

    expect(findings.map((finding) => finding.rule)).toEqual([
      'network',
      'network',
    ])
  })

  it('passes a navigation link, a fragment use, and a data URL', () => {
    const findings = linksOf(
      '<a href="https://example.com">x</a><svg><use href="#icon"></use></svg><img src="data:image/png;base64,AAAA">',
    )

    expect(findings).toEqual([])
  })

  it('reports a local image that does not exist', () => {
    expect(linksOf('<img src="gone.png">')).toMatchObject([
      { rule: 'missing-file' },
    ])
  })

  it('checks every srcset candidate', () => {
    const findings = linksOf(
      '<img srcset="a.png 1x, ../other/b.png 2x, c.png 3x">',
      { 'site/home/a.png': '', 'site/home/c.png': '' },
    )

    expect(findings).toMatchObject([{ rule: 'outside-link' }])
  })

  it('reports a url() in a style attribute at that attribute', () => {
    const findings = linksOf(
      '<div style="background: url(../other/bg.png)"></div>',
    )

    expect(findings).toMatchObject([
      { rule: 'outside-link', location: { line: 1, column: 6 } },
    ])
  })

  it('locates a url() in a style block within the frame', () => {
    const findings = linksOf(
      '<style>\n.a { color: red }\n.b { background: url(https://x.test/b.png) }\n</style>',
    )

    expect(findings).toMatchObject([
      { rule: 'network', location: { line: 3, column: 6 } },
    ])
  })

  it('reports an @import in a linked sheet against that sheet', () => {
    const findings = linksOf('<link rel="stylesheet" href="local.css">', {
      'site/home/local.css': '\n@import "../other/base.css";\n',
    })

    expect(findings).toMatchObject([
      {
        rule: 'outside-link',
        path: 'site/home/local.css',
        location: { line: 2, column: 1 },
      },
    ])
  })

  it('resolves a url() in an assets sheet against that sheet', () => {
    const findings = linksOf(
      '<link rel="stylesheet" href="../assets/shared.css">',
      {
        'site/assets/shared.css': '.a { background: url(logo.svg) }',
        'site/assets/logo.svg': '<svg/>',
      },
    )

    expect(findings).toEqual([])
  })
})
