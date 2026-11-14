import { describe, expect, it } from 'vitest'

import type { ProjectRecord } from '@/shared/records/list'

import { folderNames, homeEntries, nextFolderName } from './entries'

function project(
  name: string,
  group: string | null = null,
  modifiedAt = '2026-10-15T09:00:00.000Z',
): ProjectRecord {
  return {
    name,
    path: `/board/${name}`,
    modifiedAt,
    createdAt: null,
    group,
    archived: false,
    projectFileError: null,
    transitions: [],
    checksOff: [],
    pages: [],
  }
}

/** Each entry as a project's name or a folder's name over its members. */
function shape(projects: ProjectRecord[]) {
  return homeEntries(projects).map((entry) =>
    entry.kind === 'project'
      ? entry.project.name
      : {
          folder: entry.folder.name,
          members: entry.folder.projects.map((member) => member.name),
        },
  )
}

describe('homeEntries', () => {
  it('shows a project in no folder as its own card', () => {
    expect(shape([project('studio'), project('webapp')])).toEqual([
      'studio',
      'webapp',
    ])
  })

  it('gathers a folder where its first member stands, keeping the order shown', () => {
    expect(
      shape([
        project('web', 'Client A'),
        project('drawings'),
        project('app', 'Client A'),
        project('email', 'Client A'),
      ]),
    ).toEqual([
      { folder: 'Client A', members: ['web', 'app', 'email'] },
      'drawings',
    ])
  })

  it('reads two groups differing only in case as one folder', () => {
    expect(
      shape([project('web', 'Client A'), project('app', 'client a')]),
    ).toEqual([{ folder: 'Client A', members: ['web', 'app'] }])
  })

  it('dates a folder by its newest member', () => {
    const [entry] = homeEntries([
      project('web', 'Client', '2026-10-01T00:00:00.000Z'),
      project('app', 'Client', '2026-10-09T00:00:00.000Z'),
    ])

    expect(entry?.kind === 'folder' && entry.folder.modifiedAt).toBe(
      '2026-10-09T00:00:00.000Z',
    )
  })

  it('shows no folder once its last member leaves', () => {
    expect(shape([project('web'), project('app')])).toEqual(['web', 'app'])
  })
})

describe('folderNames', () => {
  it('names each folder once, by name', () => {
    expect(
      folderNames([
        project('a', 'Zeta'),
        project('b', 'alpha'),
        project('c', 'ZETA'),
        project('d'),
      ]),
    ).toEqual(['alpha', 'Zeta'])
  })
})

describe('nextFolderName', () => {
  it('starts at Folder', () => {
    expect(nextFolderName([])).toBe('Folder')
  })

  it('takes the next number past folders already named in any case', () => {
    expect(nextFolderName(['folder', 'Folder 2'])).toBe('Folder 3')
  })
})
