import { describe, expect, it } from 'vitest'

import type { ProjectRecord } from '@/shared/records/list'

import { orderProjects } from './sort'

function project(
  name: string,
  modifiedAt: string,
  createdAt: string | null = null,
): ProjectRecord {
  return {
    name,
    path: `/board/${name}`,
    modifiedAt,
    createdAt,
    projectFileError: null,
    pages: [],
  }
}

const names = (projects: readonly ProjectRecord[]) =>
  projects.map((project) => project.name)

const NONE = new Set<string>()

describe('orderProjects', () => {
  it('puts the last edited first', () => {
    const projects = [
      project('atlas', '2026-10-01T00:00:00.000Z'),
      project('studio', '2026-10-15T00:00:00.000Z'),
      project('webapp', '2026-10-08T00:00:00.000Z'),
    ]

    expect(names(orderProjects(projects, 'edited', NONE))).toEqual([
      'studio',
      'webapp',
      'atlas',
    ])
  })

  it('puts the newest made first', () => {
    const projects = [
      project('atlas', '2026-10-15T00:00:00.000Z', '2026-09-01T00:00:00.000Z'),
      project('studio', '2026-10-01T00:00:00.000Z', '2026-09-20T00:00:00.000Z'),
    ]

    expect(names(orderProjects(projects, 'created', NONE))).toEqual([
      'studio',
      'atlas',
    ])
  })

  it('puts a project that records no made day after every dated one', () => {
    const projects = [
      project('atlas', '2026-10-15T00:00:00.000Z', null),
      project('studio', '2026-10-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
    ]

    expect(names(orderProjects(projects, 'created', NONE))).toEqual([
      'studio',
      'atlas',
    ])
  })

  it('orders by name from A, ignoring case', () => {
    const projects = [
      project('webapp', '2026-10-15T00:00:00.000Z'),
      project('Atlas', '2026-10-01T00:00:00.000Z'),
      project('studio', '2026-10-08T00:00:00.000Z'),
    ]

    expect(names(orderProjects(projects, 'name', NONE))).toEqual([
      'Atlas',
      'studio',
      'webapp',
    ])
  })

  it('breaks a tie by name', () => {
    const at = '2026-10-15T00:00:00.000Z'
    const projects = [project('webapp', at), project('atlas', at)]

    expect(names(orderProjects(projects, 'edited', NONE))).toEqual([
      'atlas',
      'webapp',
    ])
  })

  it('holds the pinned above the rest, each group in the chosen order', () => {
    const projects = [
      project('atlas', '2026-10-01T00:00:00.000Z'),
      project('studio', '2026-10-15T00:00:00.000Z'),
      project('webapp', '2026-10-08T00:00:00.000Z'),
      project('zine', '2026-10-02T00:00:00.000Z'),
    ]

    expect(
      names(orderProjects(projects, 'edited', new Set(['atlas', 'zine']))),
    ).toEqual(['zine', 'atlas', 'studio', 'webapp'])
  })

  it('ignores a pin naming no project', () => {
    const projects = [
      project('atlas', '2026-10-01T00:00:00.000Z'),
      project('studio', '2026-10-15T00:00:00.000Z'),
    ]

    expect(names(orderProjects(projects, 'edited', new Set(['gone'])))).toEqual(
      ['studio', 'atlas'],
    )
  })
})
