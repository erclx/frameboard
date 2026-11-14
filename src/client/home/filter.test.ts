import { describe, expect, it } from 'vitest'

import type { ProjectRecord } from '@/shared/records/list'

import { filterProjects } from './filter'

function project(name: string, group: string | null = null): ProjectRecord {
  return {
    name,
    path: `/board/${name}`,
    modifiedAt: '2026-10-15T09:00:00.000Z',
    createdAt: null,
    group,
    archived: false,
    projectFileError: null,
    transitions: [],
    checksOff: [],
    pages: [],
  }
}

const names = (projects: ProjectRecord[]) =>
  projects.map((record) => record.name)

describe('filterProjects', () => {
  const BOARD = [
    project('client-web', 'Acme'),
    project('drawings'),
    project('Landing'),
    project('notes', 'Acme'),
  ]

  it('shows every project for a blank filter', () => {
    expect(names(filterProjects(BOARD, '  '))).toEqual([
      'client-web',
      'drawings',
      'Landing',
      'notes',
    ])
  })

  it('matches part of a name in any case', () => {
    expect(names(filterProjects(BOARD, 'LAND'))).toEqual(['Landing'])
  })

  it('shows every member of a folder whose name matches', () => {
    expect(names(filterProjects(BOARD, 'acme'))).toEqual([
      'client-web',
      'notes',
    ])
  })

  it('shows nothing when no name matches', () => {
    expect(filterProjects(BOARD, 'zzz')).toEqual([])
  })
})
