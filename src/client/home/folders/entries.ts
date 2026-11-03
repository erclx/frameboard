import type { ProjectRecord } from '@/shared/records/list'

/** One folder on home, holding every project whose group reads as its key. */
export interface HomeFolder {
  /** The group trimmed and lowercased, so two spellings differing in case are one folder. */
  key: string
  /** The spelling the folder shows, its first member's. */
  name: string
  /** In the order home shows projects. */
  projects: ProjectRecord[]
  /** The newest edit of any member. */
  modifiedAt: string
}

export type HomeEntry =
  | { kind: 'project'; project: ProjectRecord }
  | { kind: 'folder'; folder: HomeFolder }

/** The key a group files under, which matches two spellings differing in case. */
export function folderKey(group: string): string {
  return group.trim().toLowerCase()
}

/**
 * The cards home shows for projects already in their shown order. A folder
 * stands where its first member would, so it sorts by its newest, first-made,
 * or first-named member as the order runs, and rises with the pinned when it
 * holds one. A folder is one level deep, and one with no members never shows.
 */
export function homeEntries(projects: readonly ProjectRecord[]): HomeEntry[] {
  const entries: HomeEntry[] = []
  const folders = new Map<string, HomeFolder>()
  for (const project of projects) {
    if (project.group === null) {
      entries.push({ kind: 'project', project })
      continue
    }
    const key = folderKey(project.group)
    const folder = folders.get(key)
    if (folder) {
      folder.projects.push(project)
      if (project.modifiedAt > folder.modifiedAt) {
        folder.modifiedAt = project.modifiedAt
      }
      continue
    }
    const made: HomeFolder = {
      key,
      name: project.group,
      projects: [project],
      modifiedAt: project.modifiedAt,
    }
    folders.set(key, made)
    entries.push({ kind: 'folder', folder: made })
  }
  return entries
}

/** The name of every folder on the board, by name, for a menu offering where to file a project. */
export function folderNames(projects: readonly ProjectRecord[]): string[] {
  const names = new Map<string, string>()
  for (const project of projects) {
    if (project.group === null) continue
    const key = folderKey(project.group)
    if (!names.has(key)) names.set(key, project.group)
  }
  return [...names.values()].sort((a, b) =>
    a.localeCompare(b, 'en', { sensitivity: 'base' }),
  )
}

/** The member count as a folder's card and row print it. */
export function countOf(folder: HomeFolder): string {
  const count = folder.projects.length
  return count === 1 ? '1 project' : `${count} projects`
}

/** The first of `Folder`, `Folder 2`, and on that no folder holds in any case. */
export function nextFolderName(taken: readonly string[]): string {
  const keys = new Set(taken.map(folderKey))
  for (let count = 1; ; count += 1) {
    const name = count === 1 ? 'Folder' : `Folder ${count}`
    if (!keys.has(folderKey(name))) return name
  }
}
