import { Search } from 'lucide-react'
import { useEffect } from 'react'
import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'

import { registerActions } from '@/client/actions/registry'
import type { ProjectRecord } from '@/shared/records/list'

const FILTER_KEY = 'frameboard.home.filter'

/** The id of home's filter field, which Cmd+F focuses. */
export const FILTER_FIELD = 'home-filter'

/** The text home's projects are filtered by, remembered for the next visit as the sort is. */
export const filterStore = createStore<{ text: string }>()(() => ({
  text: readFilter(),
}))

export function useHomeFilter(): string {
  return useStore(filterStore, (state) => state.text)
}

export function setHomeFilter(text: string): void {
  filterStore.setState({ text })
  try {
    if (text === '') localStorage.removeItem(FILTER_KEY)
    else localStorage.setItem(FILTER_KEY, text)
  } catch {
    // A browser refusing storage keeps the filter for this visit alone.
  }
}

/**
 * The projects a filter shows: each whose name holds the text in any case,
 * and every member of a folder whose name holds it. A blank filter shows all.
 */
export function filterProjects(
  projects: readonly ProjectRecord[],
  text: string,
): ProjectRecord[] {
  const needle = text.trim().toLowerCase()
  if (needle === '') return [...projects]
  return projects.filter(
    (project) =>
      project.name.toLowerCase().includes(needle) ||
      (project.group?.toLowerCase().includes(needle) ?? false),
  )
}

/** Registers `home.filter` on Cmd+F while home is mounted, focusing the filter field. */
export function useFilterAction(): void {
  useEffect(
    () =>
      registerActions([
        {
          id: 'home.filter',
          label: 'Filter',
          group: 'home',
          keys: ['$mod+KeyF'],
          command: { label: 'Filter projects by name', icon: Search },
          run: () => {
            const field = document.getElementById(FILTER_FIELD)
            if (field instanceof HTMLInputElement) {
              field.focus()
              field.select()
            }
          },
        },
      ]),
    [],
  )
}

function readFilter(): string {
  try {
    return localStorage.getItem(FILTER_KEY) ?? ''
  } catch {
    return ''
  }
}
