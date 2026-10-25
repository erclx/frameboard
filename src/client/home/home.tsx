import { useState } from 'react'

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
  const layout = useHomeLayout()
  const sort = useHomeSort()
  const pins = usePins()
  useNewProjectAction(calls)
  useProjectActions(focusedProject, { calls })
  useThumbnails()
  return (
    <div className="flex min-h-full flex-col text-body">
      <HomeHeader hasProjects={projects.length > 0} />
      {projects.length === 0 ? (
        <EmptyHome />
      ) : (
        <Projects
          projects={orderProjects(projects, sort, pins)}
          layout={layout}
          now={now}
          calls={calls}
        />
      )}
    </div>
  )
}
