import type {
  FrameRecord,
  ListResult,
  PageRecord,
  ProjectRecord,
} from '@/shared/records/list'

/**
 * A board against one already held. Every level lists its children in order,
 * one that stands as its name and one that moved as its record, so an add, a
 * removal, and a reorder are each the list alone.
 */
export interface BoardPatch extends Omit<ListResult, 'projects'> {
  projects: (string | ProjectPatch)[]
}

export interface ProjectPatch extends Omit<ProjectRecord, 'pages'> {
  pages: (string | PagePatch)[]
}

export interface PagePatch extends Omit<PageRecord, 'frames'> {
  frames: (string | FrameRecord)[]
}

interface Named {
  name: string
}

/** The patch that makes `next` of `held`. */
export function patchBetween(held: ListResult, next: ListResult): BoardPatch {
  return {
    ...next,
    projects: listMoved(held.projects, next.projects, projectPatch),
  }
}

function projectPatch(
  held: ProjectRecord | undefined,
  next: ProjectRecord,
): ProjectPatch {
  return { ...next, pages: listMoved(held?.pages ?? [], next.pages, pagePatch) }
}

function pagePatch(held: PageRecord | undefined, next: PageRecord): PagePatch {
  return {
    ...next,
    frames: listMoved(held?.frames ?? [], next.frames, (_, frame) => frame),
  }
}

function listMoved<T extends Named, P>(
  held: readonly T[],
  next: readonly T[],
  patch: (held: T | undefined, next: T) => P,
): (string | P)[] {
  const byName = namedOf(held)
  return next.map((record) => {
    const match = byName.get(record.name)
    return match !== undefined && isEqual(match, record)
      ? record.name
      : patch(match, record)
  })
}

/**
 * The board `patch` makes of `held`, every record it names kept as held, or
 * null where it names one `held` does not have. The board itself is always new.
 */
export function applyPatch(
  held: ListResult,
  patch: BoardPatch,
): ListResult | null {
  const projects = listApplied(held.projects, patch.projects, applyProject)
  return projects && { ...patch, projects }
}

function applyProject(
  held: ProjectRecord | undefined,
  patch: ProjectPatch,
): ProjectRecord | null {
  const pages = listApplied(held?.pages ?? [], patch.pages, applyPage)
  return pages && { ...patch, pages }
}

function applyPage(
  held: PageRecord | undefined,
  patch: PagePatch,
): PageRecord | null {
  const frames = listApplied(
    held?.frames ?? [],
    patch.frames,
    (_, frame) => frame,
  )
  return frames && { ...patch, frames }
}

function listApplied<T extends Named, P extends Named>(
  held: readonly T[],
  patches: readonly (string | P)[],
  apply: (held: T | undefined, patch: P) => T | null,
): T[] | null {
  const byName = namedOf(held)
  const list: T[] = []
  for (const patch of patches) {
    const record =
      typeof patch === 'string'
        ? byName.get(patch)
        : apply(byName.get(patch.name), patch)
    if (!record) return null
    list.push(record)
  }
  return list
}

function namedOf<T extends Named>(records: readonly T[]): Map<string, T> {
  return new Map(records.map((record) => [record.name, record]))
}

/** Whether two JSON values match on every key, named in their types or not. */
export function isEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (!isObject(a) || !isObject(b)) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const keys = Object.keys(a)
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => Object.hasOwn(b, key) && isEqual(a[key], b[key]))
  )
}

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null
}
