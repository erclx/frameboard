import { describe, expect, it } from 'vitest'

import { boardOf, frameOf, pageOf } from '@/test/board'

import { renameOnBoard, takesRename } from './rename'

const home = (...names: string[]) =>
  boardOf(pageOf(names.map((name) => frameOf(name))))

describe('renameOnBoard', () => {
  it('renames a page, frames and paths included', () => {
    const board = renameOnBoard(home('hero'), 'studio/home', 'studio/start')

    const page = board.projects[0]?.pages[0]
    expect(page).toMatchObject({
      ref: 'studio/start',
      name: 'start',
      path: '/board/studio/start',
    })
    expect(page?.frames[0]).toMatchObject({
      ref: 'studio/start/hero',
      page: 'start',
      path: '/board/studio/start/hero.html',
    })
  })

  it('renames a project, pages and frames included', () => {
    const board = renameOnBoard(home('hero'), 'studio', 'atelier')

    const project = board.projects[0]
    expect(project).toMatchObject({ name: 'atelier', path: '/board/atelier' })
    expect(project?.pages[0]).toMatchObject({
      ref: 'atelier/home',
      project: 'atelier',
      path: '/board/atelier/home',
    })
    expect(project?.pages[0]?.frames[0]).toMatchObject({
      ref: 'atelier/home/hero',
      project: 'atelier',
      path: '/board/atelier/home/hero.html',
    })
  })

  it('renames one frame, its page and siblings left alone', () => {
    const board = renameOnBoard(
      home('hero', 'footer'),
      'studio/home/hero',
      'studio/home/lead',
    )

    const page = board.projects[0]?.pages[0]
    expect(page).toMatchObject({ ref: 'studio/home', name: 'home' })
    expect(page?.frames[0]).toMatchObject({
      ref: 'studio/home/lead',
      name: 'lead',
      page: 'home',
      path: '/board/studio/home/lead.html',
    })
    expect(page?.frames[1]).toMatchObject({
      ref: 'studio/home/footer',
      path: '/board/studio/home/footer.html',
    })
  })
})

describe('takesRename', () => {
  it.each([
    ['a page', 'studio/home', 'studio/start'],
    ['a project', 'studio', 'atelier'],
    ['a frame', 'studio/home/hero', 'studio/home/lead'],
  ])('waits on a rename of %s the board does not carry yet', (_, from, to) => {
    expect(takesRename(home('hero'), from, to)).toBe(true)
  })

  it.each([
    ['a page', 'studio/start', 'studio/home'],
    ['a project', 'atelier', 'studio'],
    ['a frame', 'studio/home/lead', 'studio/home/hero'],
  ])('refuses a rename of %s the board already carries', (_, from, to) => {
    expect(takesRename(home('hero'), from, to)).toBe(false)
  })

  it('refuses a rename onto a name the board holds beside the old one', () => {
    expect(
      takesRename(home('hero', 'lead'), 'studio/home/hero', 'studio/home/lead'),
    ).toBe(false)
  })
})
