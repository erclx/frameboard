import { describe, expect, it } from 'vitest'

import type {
  FrameRecord,
  ListResult,
  PageRecord,
  ProjectRecord,
} from '@/shared/records/list'

import { isUntouched } from './untouched'

function page(name: string, frames: FrameRecord[] = []): PageRecord {
  return {
    ref: `untitled/${name}`,
    project: 'untitled',
    name,
    path: `/board/untitled/${name}`,
    index: 0,
    layoutError: null,
    frames,
  }
}

function project(name: string, pages: PageRecord[]): ProjectRecord {
  return {
    name,
    path: `/board/${name}`,
    modifiedAt: '2026-10-25T09:00:00.000Z',
    createdAt: '2026-10-25T09:00:00.000Z',
    projectFileError: null,
    pages,
  }
}

function board(...projects: ProjectRecord[]): ListResult {
  return { root: '/board', projects }
}

const FRAME: FrameRecord = {
  ref: 'untitled/page-1/phone',
  project: 'untitled',
  page: 'page-1',
  name: 'phone',
  path: '/board/untitled/page-1/phone.html',
  box: { x: 0, y: 0, width: 390, height: 844 },
  order: 0,
  hidden: false,
  locked: false,
  hugWidth: false,
  hugHeight: false,
  placed: true,
  modifiedAt: '2026-10-25T09:00:00.000Z',
}

describe('isUntouched', () => {
  it('holds for the start project with its one empty page on a writing tab', () => {
    expect(
      isUntouched(board(project('untitled', [page('page-1')])), true),
    ).toBe(true)
  })

  it('fails on a tab that only reads', () => {
    expect(
      isUntouched(board(project('untitled', [page('page-1')])), false),
    ).toBe(false)
  })

  it('fails once the page holds a frame, hidden or not', () => {
    expect(
      isUntouched(
        board(
          project('untitled', [page('page-1', [{ ...FRAME, hidden: true }])]),
        ),
        true,
      ),
    ).toBe(false)
  })

  it('fails once the project is renamed', () => {
    expect(isUntouched(board(project('acme', [page('page-1')])), true)).toBe(
      false,
    )
  })

  it('fails beside a second project', () => {
    expect(
      isUntouched(
        board(
          project('untitled', [page('page-1')]),
          project('brand', [page('page-1')]),
        ),
        true,
      ),
    ).toBe(false)
  })

  it('fails once a second page is added', () => {
    expect(
      isUntouched(
        board(project('untitled', [page('page-1'), page('page-2')])),
        true,
      ),
    ).toBe(false)
  })

  it('fails before the first board arrives', () => {
    expect(isUntouched(null, true)).toBe(false)
  })
})
