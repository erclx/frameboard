import { afterEach, describe, expect, it } from 'vitest'

import { type TempBoard, writeBoard } from '../../../test/support/temp-board'
import { readFrame } from './frame-source'
import { checkDotFolders, checkMarkup, checkNaming } from './structure'

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
