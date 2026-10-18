import { useActions } from '@/client/actions/registry'

import { NewProjectButton } from './header'

/**
 * The home view of a board with no projects, per `canon/design/home/empty`.
 * The terminal command keeps it usable while New project waits on the row
 * that registers `project.new`.
 */
export function EmptyHome() {
  const [newProject] = useActions(['project.new'])
  return (
    <div className="relative flex-1">
      <div className="absolute top-1/2 left-1/2 w-105 max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-[55%] text-center leading-[1.6] text-muted-foreground">
        <div
          aria-hidden
          className="mx-auto mb-3.5 h-12 w-16 rounded-lg border-[1.5px] border-dashed border-faint"
        />
        <h1 className="mb-1 text-sm font-semibold text-foreground">
          No projects yet
        </h1>
        <p>
          A project holds the pages and frames for one thing you are designing.
        </p>
        <NewProjectButton
          action={newProject}
          className="mx-auto mt-3.5 mb-2.5"
        />
        <p>
          or from a terminal{' '}
          <code className="rounded-[5px] bg-muted px-1.5 py-0.5 font-mono text-label font-normal text-foreground">
            frameboard project add &lt;name&gt;
          </code>
        </p>
      </div>
    </div>
  )
}
