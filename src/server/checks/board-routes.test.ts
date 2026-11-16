import { afterEach, describe, expect, it } from 'vitest'

import { type TempBoard, writeBoard } from '../../../test/support/temp-board'
import { checkBoardRoutes } from './board-routes'
import { checkFrameIn, readProjectContext } from './frame'
import { readFrame } from './frame-source'

let board: TempBoard | undefined

afterEach(() => {
  board?.cleanup()
  board = undefined
})

const HERO = { project: 'site', page: 'home', name: 'hero' }

/** The hero frame on page `home`, with `files` written beside it. */
function routesOf(html: string, files: Record<string, string> = {}) {
  board = writeBoard({ 'site/home/hero.html': html, ...files })
  return checkBoardRoutes(readFrame({ root: board.root, ...HERO }))
}

describe('checkBoardRoutes', () => {
  it('reports an inline script calling a board route, at the string', () => {
    const findings = routesOf(
      "<p>x</p>\n<script>\nfetch('/api/frames/edit', { method: 'POST' })\n</script>",
    )

    expect(findings).toMatchObject([
      {
        rule: 'board-route',
        severity: 'error',
        frame: 'site/home/hero',
        path: 'site/home/hero.html',
        location: { line: 3, column: 7 },
      },
    ])
    expect(findings[0]?.message).toContain('/api/frames/edit')
  })

  it('reports a local src script naming a route, in the script file', () => {
    const findings = routesOf('<script src="app.js"></script>', {
      'site/home/app.js': 'const a = 1\nfetch(`/api/page/${a}`)\n',
    })

    expect(findings).toMatchObject([
      {
        rule: 'board-route',
        frame: 'site/home/hero',
        path: 'site/home/app.js',
        location: { line: 2, column: 7 },
      },
    ])
  })

  it.each([
    ['a remote src', '<script src="https://example.com/app.js"></script>'],
    ['a missing src', '<script src="gone.js"></script>'],
  ])('reports nothing for %s', (_, html) => {
    expect(routesOf(html)).toEqual([])
  })

  it('reports an onclick handler naming a route, at the attribute', () => {
    const findings = routesOf(
      "<button onclick=\"fetch('/api/page/delete', { method: 'POST' })\">Go</button>",
    )

    expect(findings).toMatchObject([
      {
        rule: 'board-route',
        path: 'site/home/hero.html',
        location: { line: 1, column: 9 },
      },
    ])
  })

  it('reports a handler on an element inside an SVG', () => {
    const findings = routesOf(
      '<svg><rect onclick="fetch(\'/api/frames\')"></rect></svg>',
    )

    expect(findings).toMatchObject([{ rule: 'board-route' }])
  })

  it.each([
    ['http://127.0.0.1:4173/api/frames/edit'],
    ['//localhost:4173/api/frames/edit'],
  ])('reports the absolute %s as the relative path', (url) => {
    const findings = routesOf(`<script>fetch("${url}")</script>`)

    expect(findings).toMatchObject([{ rule: 'board-route' }])
  })

  it('leaves body text naming a path outside any script alone', () => {
    expect(
      routesOf('<p>Our app calls /api/users and "/api/orders".</p>'),
    ).toEqual([])
  })

  it('leaves a comment in a script naming a path outside a string alone', () => {
    expect(
      routesOf('<script>\n// the real app reads /api/users\n</script>'),
    ).toEqual([])
  })

  it.each([
    ['a module', 'module'],
    ['a JavaScript type', 'text/javascript'],
  ])('reports %s script', (_, type) => {
    const findings = routesOf(
      `<script type="${type}">fetch('/api/frames')</script>`,
    )

    expect(findings).toMatchObject([{ rule: 'board-route' }])
  })

  it.each([
    ['a JSON data block', 'application/json'],
    ['an import map', 'importmap'],
    ['a template block', 'text/template'],
  ])('leaves %s alone, since it never runs', (_, type) => {
    expect(
      routesOf(`<script type="${type}">{"url": "/api/users/1"}</script>`),
    ).toEqual([])
  })

  it('leaves a string naming another app path alone', () => {
    expect(
      routesOf("<script>fetch('/v1/api/users'); fetch('api/x')</script>"),
    ).toEqual([])
  })
})

describe('board-route through checkFrameIn', () => {
  const html = "<script>fetch('/api/frames/edit')</script>"

  it('reports with the rule on', () => {
    board = writeBoard({ 'site/home/hero.html': html })
    const findings = checkFrameIn(
      { root: board.root, ...HERO },
      readProjectContext(board.root, 'site'),
    )

    expect(findings.map((finding) => finding.rule)).toContain('board-route')
  })

  it('reports nothing for a project listing it in checks.off', () => {
    board = writeBoard({
      'site/home/hero.html': html,
      'site/project.json': JSON.stringify({
        checks: { off: ['board-route'] },
      }),
    })
    const findings = checkFrameIn(
      { root: board.root, ...HERO },
      readProjectContext(board.root, 'site'),
    )

    expect(findings.map((finding) => finding.rule)).not.toContain('board-route')
  })
})
