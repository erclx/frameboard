import { afterEach, describe, expect, it } from 'vitest'

import { type TempBoard, writeBoard } from '../../../test/support/temp-board'
import { readFrame } from './frame-source'
import {
  checkDotFolders,
  checkMalformedTags,
  checkMarkup,
  checkNaming,
  checkNesting,
} from './structure'

let board: TempBoard | undefined

afterEach(() => {
  board?.cleanup()
  board = undefined
})

function frame(html: string) {
  board = writeBoard({ 'site/home/hero.html': html })
  return readFrame({
    root: board.root,
    project: 'site',
    page: 'home',
    name: 'hero',
  })
}

describe('checkNaming', () => {
  const target = { root: '/b', project: 'site', page: 'home', name: 'hero' }

  it('passes valid page and frame names', () => {
    expect(checkNaming(target, 'site/home/hero.html')).toEqual([])
  })

  it('reports a frame name with a space', () => {
    const findings = checkNaming(
      { ...target, name: 'Bad Name' },
      'site/home/Bad Name.html',
    )

    expect(findings).toMatchObject([
      { rule: 'naming', frame: 'site/home/Bad Name', location: null },
    ])
  })

  it('reports a page named for the assets folder', () => {
    expect(checkNaming({ ...target, page: 'Assets' }, 'x')).toMatchObject([
      { rule: 'naming' },
    ])
  })
})

describe('checkDotFolders', () => {
  it('reports each dot-named folder as a project finding', () => {
    expect(checkDotFolders('/b', '/b/site', ['home', '.drafts'])).toMatchObject(
      [{ rule: 'dot-folder', frame: null, path: 'site/.drafts' }],
    )
  })
})

describe('checkMarkup', () => {
  it('reports a stated head with no body at the head tag', () => {
    const findings = checkMarkup(
      frame(
        '<!doctype html>\n<html>\n<head><title>x</title></head>\n<p>hi</p>\n</html>',
      ),
    )

    expect(findings).toMatchObject([
      {
        rule: 'head-body',
        path: 'site/home/hero.html',
        location: { line: 3, column: 1, startOffset: 23 },
      },
    ])
  })

  it('passes a fragment that states neither head nor body', () => {
    expect(checkMarkup(frame('<p>hi</p>'))).toEqual([])
  })

  it('reports a table holding rows with no tbody', () => {
    const findings = checkMarkup(
      frame('<body>\n<table><tr><td>1</td></tr></table>\n</body>'),
    )

    expect(findings).toMatchObject([
      { rule: 'table-tbody', location: { line: 2, column: 1 } },
    ])
  })

  it('passes a table stating its tbody', () => {
    expect(
      checkMarkup(frame('<table><tbody><tr><td>1</td></tr></tbody></table>')),
    ).toEqual([])
  })

  it('passes a table holding only a thead', () => {
    expect(
      checkMarkup(frame('<table><thead><tr><th>1</th></tr></thead></table>')),
    ).toEqual([])
  })

  it('locates past a leading BOM as the file counts it', () => {
    const findings = checkMarkup(frame('﻿<table><tr><td>1</td></tr></table>'))

    expect(findings[0]?.location).toMatchObject({ column: 2, startOffset: 1 })
  })
})

describe('checkMalformedTags', () => {
  it('reports a quote ending a quoted attribute once, at its first error', () => {
    const findings = checkMalformedTags(
      frame(
        '<body>\n<div style="font-family:Geist,"DejaVu Sans",sans-serif">x</div>\n</body>',
      ),
    )

    expect(findings).toMatchObject([
      {
        rule: 'malformed-tag',
        severity: 'error',
        path: 'site/home/hero.html',
        location: { line: 2, column: 32 },
      },
    ])
    expect(findings[0]?.message).toContain(
      'missing-whitespace-between-attributes',
    )
  })

  it('reports an attribute stated twice', () => {
    expect(
      checkMalformedTags(frame('<div id="a" id="b">x</div>')),
    ).toMatchObject([{ rule: 'malformed-tag', location: { column: 15 } }])
  })

  it('reports a file ending inside a tag', () => {
    expect(checkMalformedTags(frame('<p>x</p><div class="a'))).toMatchObject([
      { rule: 'malformed-tag' },
    ])
  })

  it('passes single quotes inside a double-quoted attribute', () => {
    expect(
      checkMalformedTags(
        frame(
          '<div style="font-family:Geist,\'DejaVu Sans\',sans-serif">x</div>',
        ),
      ),
    ).toEqual([])
  })

  it('passes a fragment with no doctype', () => {
    expect(checkMalformedTags(frame('<p>hi</p>'))).toEqual([])
  })
})

describe('checkNesting', () => {
  it('reports the empty <p> a </p> after a block adds, at that end tag', () => {
    const findings = checkNesting(frame('<body>\n<p><div></div></p>\n</body>'))

    expect(findings).toMatchObject([
      { rule: 'nesting', location: { line: 2, column: 15, startOffset: 21 } },
    ])
  })

  it('reports an <a> inside an <a> at the outer one', () => {
    const findings = checkNesting(
      frame('<body>\n<a href="#">a<a href="#">b</a></a>\n</body>'),
    )

    expect(findings).toMatchObject([
      { rule: 'nesting', location: { line: 2, column: 1 } },
    ])
  })

  it('reports a <div> a table moves out ahead of it', () => {
    const findings = checkNesting(
      frame('<table><div>x</div><tbody><tr><td>1</td></tr></tbody></table>'),
    )

    expect(findings).toMatchObject([
      { rule: 'nesting', location: { startOffset: 7 } },
    ])
  })

  it('reports a <span> its parent closes', () => {
    expect(checkNesting(frame('<div><span>x</div>'))).toMatchObject([
      { rule: 'nesting', location: { startOffset: 5 } },
    ])
  })

  it('passes paragraphs and list items left open, as a valid file may', () => {
    expect(checkNesting(frame('<p>a<p>b<ul><li>a<li>b</ul>'))).toEqual([])
  })

  it('passes a self-closing SVG path', () => {
    expect(
      checkNesting(frame('<svg viewBox="0 0 1 1"><path d="M0 0"/></svg>')),
    ).toEqual([])
  })

  it('passes a template holding cells outside a table', () => {
    expect(
      checkNesting(frame('<template><td>x</td></template><p>a</p>')),
    ).toEqual([])
  })

  it('passes a full document stating its own wrappers', () => {
    expect(
      checkNesting(
        frame(
          '<!doctype html><html><head><title>x</title></head><body><img src="a.png"><br></body></html>',
        ),
      ),
    ).toEqual([])
  })
})
