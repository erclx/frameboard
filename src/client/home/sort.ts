import { ArrowDownUp, CalendarPlus, CaseSensitive, Clock } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { refreshActions, registerActions } from '@/client/actions/registry'
import type { ProjectRecord } from '@/shared/records/list'

export type HomeSort = 'edited' | 'created' | 'name'

export type SortDirection = 'asc' | 'desc'

/** The order the home view shows, being the key and which way it runs. */
export interface HomeOrder {
  by: HomeSort
  direction: SortDirection
}

const SORT_KEY = 'frameboard.home.sort'
/** Its own key, so a `frameboard.home.sort` stored before directions keeps reading. */
const DIRECTION_KEY = 'frameboard.home.sortDirection'
const SORTS: readonly HomeSort[] = ['edited', 'created', 'name']

/** Each key's first direction: the dates newest first, the name from A. */
export const NATURAL: Readonly<Record<HomeSort, SortDirection>> = {
  edited: 'desc',
  created: 'desc',
  name: 'asc',
}

/**
 * The home view's order, remembered for the next visit as the layout is,
 * with `home.sortEdited`, `home.sortCreated`, and `home.sortName` registered
 * so the header's menu and the palette choose it the same way. Choosing a key
 * starts it in its natural direction, and `home.sortReverse` flips it, checked
 * while the order runs against that direction.
 */
export function useHomeSort(): HomeOrder {
  const [order, setOrder] = useState<HomeOrder>(readOrder)
  const current = useRef(order)

  useEffect(() => {
    const choose = (next: HomeOrder) => {
      current.current = next
      setOrder(next)
      writeOrder(next)
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
      run: () => choose({ by: value, direction: NATURAL[value] }),
      checked: () => current.current.by === value,
    })
    return registerActions([
      option('home.sortEdited', 'edited', 'Last edited', Clock),
      option('home.sortCreated', 'created', 'Created', CalendarPlus),
      option('home.sortName', 'name', 'Name', CaseSensitive),
      {
        id: 'home.sortReverse',
        label: 'Reverse',
        group: 'home',
        command: { label: 'Reverse project order', icon: ArrowDownUp },
        run: () => {
          const { by, direction } = current.current
          choose({ by, direction: direction === 'asc' ? 'desc' : 'asc' })
        },
        checked: () =>
          current.current.direction !== NATURAL[current.current.by],
      },
    ])
  }, [])

  return order
}

/**
 * The projects as the home view shows them: the pinned above the rest, each
 * group by `sort` in `direction`, its natural one when absent. A project
 * that records no made day sits after every dated one either way, and a tie
 * falls to the name from A.
 */
export function orderProjects(
  projects: readonly ProjectRecord[],
  sort: HomeSort,
  pinned: ReadonlySet<string>,
  direction: SortDirection = NATURAL[sort],
): ProjectRecord[] {
  const compare = COMPARE[sort]
  const sign = direction === 'asc' ? 1 : -1
  return [...projects].sort(
    (a, b) =>
      Number(pinned.has(b.name)) - Number(pinned.has(a.name)) ||
      (sort === 'created' ? undated(a, b) : 0) ||
      sign * compare(a, b) ||
      byName(a, b),
  )
}

type Compare = (a: ProjectRecord, b: ProjectRecord) => number

const byName: Compare = (a, b) =>
  a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) ||
  (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)

/** Each key ascending, so a direction is a sign on it. */
const COMPARE: Readonly<Record<HomeSort, Compare>> = {
  edited: (a, b) => Date.parse(a.modifiedAt) - Date.parse(b.modifiedAt),
  created: (a, b) => madeAt(a) - madeAt(b),
  name: byName,
}

/** A project with no made day after every dated one, whichever way the dates run. */
const undated: Compare = (a, b) =>
  Number(a.createdAt === null) - Number(b.createdAt === null)

function madeAt(project: ProjectRecord): number {
  return project.createdAt ? Date.parse(project.createdAt) : 0
}

function readOrder(): HomeOrder {
  try {
    const stored = localStorage.getItem(SORT_KEY)
    const by = SORTS.find((sort) => sort === stored) ?? 'edited'
    const direction = localStorage.getItem(DIRECTION_KEY)
    return {
      by,
      direction:
        direction === 'asc' || direction === 'desc' ? direction : NATURAL[by],
    }
  } catch {
    return { by: 'edited', direction: NATURAL.edited }
  }
}

function writeOrder({ by, direction }: HomeOrder): void {
  try {
    localStorage.setItem(SORT_KEY, by)
    localStorage.setItem(DIRECTION_KEY, direction)
  } catch {
    // A browser refusing storage keeps the choice for this visit alone.
  }
}
