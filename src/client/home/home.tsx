import { useState } from 'react'

import type { Structure } from '@/client/live/structure'
import { useProjectActions } from '@/client/projects/actions'
import type { ProjectRecord } from '@/shared/records/list'

import { EmptyHome } from './empty'
import { HomeHeader } from './header'
import { useHomeLayout } from './layout'
import { Projects } from './projects'
import { useThumbnails } from './thumbnails'

interface HomeProps {
  projects: readonly ProjectRecord[]
  /** Stands in for the server's structure routes, as a test's server does. */
  calls?: Structure
}

/** The home view under its header, counting "last edited" back from when it opened. */
export function Home({ projects, calls }: HomeProps) {
  const [now] = useState(Date.now)
  const layout = useHomeLayout()
  useProjectActions(calls)
  useThumbnails()
  return (
    <div className="flex min-h-full flex-col text-body">
      <HomeHeader hasProjects={projects.length > 0} />
      {projects.length === 0 ? (
        <EmptyHome />
      ) : (
        <Projects projects={projects} layout={layout} now={now} calls={calls} />
      )}
    </div>
  )
}
