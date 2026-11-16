import { useState } from 'react'
import { useStore } from 'zustand'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/client/components/ui/dialog'
import { KitCards } from '@/client/kits/kit-cards'
import { useKits } from '@/client/kits/kits'
import { cn } from '@/client/lib/cn'
import { useLive } from '@/client/live/store'
import { type Structure, structure } from '@/client/live/structure'
import { createProject, projectStore } from '@/client/projects/actions'
import { START_PROJECT } from '@/shared/board-files'
import type { KitRecord } from '@/shared/kits'
import { nextFreeName } from '@/shared/names'

const BLANK = { title: 'Blank', description: "The board's own look" }

/**
 * New project's dialog, per `canon/design/home/new-project-kit`: Blank and
 * every kit as cards, and Create project, which adds the project, installs
 * the kit picked, and opens the new card's name for renaming. Blank is
 * picked as it opens, so Enter alone adds a project the way the button
 * always has.
 */
export function NewProjectDialog({
  calls = structure,
  loadKits,
}: {
  calls?: Structure
  /** Reads the kits the board can install, the server's when absent. */
  loadKits?: () => Promise<KitRecord[] | null>
}) {
  const open = useStore(projectStore, (state) => state.creating)
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) projectStore.setState({ creating: false })
      }}
    >
      {open ? <Body calls={calls} loadKits={loadKits} /> : null}
    </Dialog>
  )
}

function Body({
  calls,
  loadKits,
}: {
  calls: Structure
  loadKits?: () => Promise<KitRecord[] | null>
}) {
  const kits = useKits(loadKits)
  const [kit, setKit] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const folder = useLive((live) =>
    nextFreeName(
      START_PROJECT,
      (live.board?.projects ?? []).map((project) => project.name),
    ),
  )
  const picked = kits?.find((each) => each.name === kit)

  const create = async () => {
    if (busy) return
    setBusy(true)
    try {
      await createProject(kit, calls)
      projectStore.setState({ creating: false })
    } finally {
      setBusy(false)
    }
  }

  return (
    <DialogContent showCloseButton={false} className="gap-0 p-0 sm:max-w-130">
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void create()
        }}
      >
        <div className="px-4 pt-3.5">
          <DialogTitle className="text-sm font-semibold">
            New project
          </DialogTitle>
          <DialogDescription className="mt-1 text-body leading-[1.55]">
            Pick the look its frames start from. You name it on its card next,
            and can save any project as a kit later.
          </DialogDescription>
        </div>
        <div className="px-4 pt-3 pb-4">
          <span
            id="new-project-kit"
            className="mb-1.5 block text-label font-normal text-muted-foreground"
          >
            Kit
          </span>
          <KitCards
            kits={kits}
            value={kit}
            onChange={setKit}
            group="new-project-kit"
            labelledBy="new-project-kit"
            blank={BLANK}
            className="grid-cols-2 sm:grid-cols-4"
          />
          <p className="mt-3 flex flex-wrap items-center gap-1.5 text-label font-normal text-muted-foreground">
            Creates <Path>{folder}/</Path>
            {picked ? (
              <>
                with the {picked.title} tokens and a <Path>kit</Path> page
              </>
            ) : (
              "with the board's own look"
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={() => projectStore.setState({ creating: false })}
            className="ml-auto h-[30px] rounded-lg bg-muted px-3 font-medium outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            Cancel
          </button>
          <button
            type="submit"
            aria-disabled={busy}
            className={cn(
              'h-[30px] rounded-lg bg-primary-fill px-3 font-medium text-primary-foreground outline-none hover:bg-primary-fill-hover focus-visible:ring-3 focus-visible:ring-ring/50 aria-disabled:opacity-60',
            )}
          >
            Create project
          </button>
        </div>
      </form>
    </DialogContent>
  )
}

function Path({ children }: { children: string | string[] }) {
  return (
    <code className="rounded bg-muted px-[5px] py-px font-mono text-[10.5px]">
      {children}
    </code>
  )
}
