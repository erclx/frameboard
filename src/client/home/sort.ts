import { CalendarPlus, CaseSensitive, Clock } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { refreshActions, registerActions } from '@/client/actions/registry'
import type { ProjectRecord } from '@/shared/records/list'

export type HomeSort = 'edited' | 'created' | 'name'

const SORT_KEY = 'frameboard.home.sort'
const SORTS: readonly HomeSort[] = ['edited', 'created', 'name']

/**
 * The home view's order, remembered for the next visit as the layout is,
 * with `home.sortEdited`, `home.sortCreated`, and `home.sortName` registered
 * so the header's menu and the palette choose it the same way.
 */
export function useHomeSort(): HomeSort {
  const [sort, setSort] = useState<HomeSort>(readSort)
  const current = useRef(sort)

  useEffect(() => {
    const choose = (next: HomeSort) => {
      current.current = next
      setSort(next)
      writeSort(next)
      refreshActions()
    }
    const option = (
      id: string,
      value: HomeSort,
      label: string,
      icon: typeof Clock,
    ) => ({
      id,
      label,
      group: 'home',
      command: { label: `Sort projects by ${label.toLowerCase()}`, icon },
      run: () => choose(value),
      checked: () => current.current === value,
    })
    return registerActions([
      option('home.sortEdited', 'edited', 'Last edited', Clock),
      option('home.sortCreated', 'created', 'Created', CalendarPlus),
      option('home.sortName', 'name', 'Name', CaseSensitive),
    ])
  }, [])

  return sort
}

/**
 * The projects as the home view shows them: the pinned above the rest, each
 * group by `sort`. Last edited and created run newest first, a project that
 * records no made day sits after every dated one, and a tie falls to the name.
 */
export function orderProjects(
  projects: readonly ProjectRecord[],
  sort: HomeSort,
  pinned: ReadonlySet<string>,
): ProjectRecord[] {
  const compare = COMPARE[sort]
  return [...projects].sort(
    (a, b) =>
      Number(pinned.has(b.name)) - Number(pinned.has(a.name)) ||
      compare(a, b) ||
      byName(a, b),
  )
}

type Compare = (a: ProjectRecord, b: ProjectRecord) => number

const byName: Compare = (a, b) =>
  a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) ||
  (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)

const COMPARE: Readonly<Record<HomeSort, Compare>> = {
  edited: (a, b) => Date.parse(b.modifiedAt) - Date.parse(a.modifiedAt),
  created: (a, b) => madeAt(b) - madeAt(a),
  name: byName,
}

/** A project with no made day counts as made before every dated one. */
function madeAt(project: ProjectRecord): number {
  return project.createdAt ? Date.parse(project.createdAt) : -Infinity
}

function readSort(): HomeSort {
  try {
    const stored = localStorage.getItem(SORT_KEY)
    return SORTS.find((sort) => sort === stored) ?? 'edited'
  } catch {
    return 'edited'
  }
}

function writeSort(sort: HomeSort): void {
  try {
    localStorage.setItem(SORT_KEY, sort)
  } catch {
    // A browser refusing storage keeps the choice for this visit alone.
  }
}
