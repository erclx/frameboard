import { useState } from 'react'

import type { ProjectRecord } from '@/shared/records/list'

import { EmptyHome } from './empty'
import { HomeHeader } from './header'
import { useHomeLayout } from './layout'
import { Projects } from './projects'

/** The home view under its header, counting "last edited" back from when it opened. */
export function Home({ projects }: { projects: readonly ProjectRecord[] }) {
  const [now] = useState(Date.now)
  const layout = useHomeLayout()
  return (
    <div className="flex min-h-full flex-col text-body">
      <HomeHeader hasProjects={projects.length > 0} />
      {projects.length === 0 ? (
        <EmptyHome />
      ) : (
        <Projects projects={projects} layout={layout} now={now} />
      )}
    </div>
  )
}
