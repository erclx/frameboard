import { useEffect, useState } from 'react'

import { registerActions } from '@/client/actions/registry'
import { useGuideLanding } from '@/client/board/guide/state'
import type { Structure } from '@/client/live/structure'
import {
  focusedProject,
  useNewProjectAction,
  useProjectActions,
} from '@/client/projects/actions'
import type { ProjectRecord } from '@/shared/records/list'

import { EmptyHome } from './empty'
import { HomeHeader } from './header'
import { useHomeLayout } from './layout'
import { usePins } from './pins'
import { Projects } from './projects'
import { orderProjects, useHomeSort } from './sort'
import { useThumbnails } from './thumbnails'

interface HomeProps {
  projects: readonly ProjectRecord[]
  /** Stands in for the server's structure routes, as a test's server does. */
  calls?: Structure
}

/**
 * The home view under its header, counting "last edited" back from when it
 * opened. The projects are ordered once here, so the cards, the arrow keys,
 * and the tab stop all follow the order shown.
 */
export function Home({ projects, calls }: HomeProps) {
  const [now] = useState(Date.now)
  const holding = useGuideLanding()
  const layout = useHomeLayout()
  const sort = useHomeSort()
  const pins = usePins()
  useNewProjectAction(calls)
  useProjectActions(focusedProject, { calls })
  useCardKeys()
  useThumbnails()
  if (holding) return null
  return (
    <div className="flex min-h-full flex-col text-body">
      <HomeHeader hasProjects={projects.length > 0} />
      {projects.length === 0 ? (
        <EmptyHome />
      ) : (
        <Projects
          projects={orderProjects(projects, sort.by, pins, sort.direction)}
          layout={layout}
          now={now}
          calls={calls}
        />
      )}
    </div>
  )
}

/**
 * Registers the keys that bring focus to the cards while nothing holds it,
 * so the first press lands rather than doing nothing. An arrow or h, j, k,
 * and l land on the tab stop card, Home on the first, and End on the last.
 * Once a card holds focus they stand down and the cards' own keys move it.
 */
function useCardKeys(): void {
  const projectLinks = () => [
    ...document.querySelectorAll<HTMLElement>('[data-project-link]'),
  ]
  useEffect(() => {
    const idle = () =>
      (document.activeElement ?? document.body) === document.body &&
      projectLinks().length > 0
    const land =
      (pick: (links: HTMLElement[]) => HTMLElement | undefined) => () =>
        pick(projectLinks())?.focus()
    return registerActions([
      {
        id: 'home.focusCards',
        label: 'Focus the projects',
        group: 'project',
        palette: false,
        keys: [
          'ArrowUp',
          'ArrowDown',
          'ArrowLeft',
          'ArrowRight',
          'h',
          'j',
          'k',
          'l',
        ],
        enabled: idle,
        run: land((links) => links.find((link) => link.tabIndex === 0)),
      },
      {
        id: 'home.focusFirst',
        label: 'Focus the first project',
        group: 'project',
        palette: false,
        keys: ['Home'],
        enabled: idle,
        run: land((links) => links[0]),
      },
      {
        id: 'home.focusLast',
        label: 'Focus the last project',
        group: 'project',
        palette: false,
        keys: ['End'],
        enabled: idle,
        run: land((links) => links.at(-1)),
      },
    ])
  }, [])
}
