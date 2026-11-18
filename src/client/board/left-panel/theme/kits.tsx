import { Plus, X } from 'lucide-react'
import { useState } from 'react'
import { useStore } from 'zustand'

import { Button } from '@/client/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/client/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/client/components/ui/dropdown-menu'
import { useKits } from '@/client/kits/kits'
import { cn } from '@/client/lib/cn'
import { useLive } from '@/client/live/store'
import { type Structure, structure } from '@/client/live/structure'
import type { KitRecord } from '@/shared/kits'
import type {
  FrameRecord,
  ListResult,
  ProjectKitRecord,
} from '@/shared/records/list'

import { ChromeMenuContent, MENU_ROW } from '../../chrome/menu'
import { askOnFrame } from '../../notes/tool'
import { selectionStore } from '../../selection'
import { reportRefusal } from '../page-actions'
import { addKitStore, ASK_FOR_KIT } from './add-kit'

const NO_KITS: readonly ProjectKitRecord[] = []

interface KitsSectionProps {
  project: string
  /** Lists the kits the board can add, the API in the app. */
  loadKits?: () => Promise<KitRecord[] | null>
  calls?: Pick<Structure, 'installKit' | 'removeKit'>
}

/**
 * The kits a project added, each with the count of frames using it, and the
 * Add kit list of every shipped and saved kit plus a note asking the agent
 * for a new one. Counts read the live board, so Remove's confirm names the
 * frames it clears as they stand.
 */
export function KitsSection({
  project,
  loadKits,
  calls = structure,
}: KitsSectionProps) {
  const canWrite = useLive((state) => state.canWrite)
  const kits = useLive((state) => projectOf(state.board, project)?.kits)
  const added = kits ?? NO_KITS
  const [removing, setRemoving] = useState<ProjectKitRecord | null>(null)

  const remove = (kit: ProjectKitRecord) => {
    calls
      .removeKit(project, kit.name)
      .catch(reportRefusal('Couldn’t remove the kit'))
  }

  return (
    <section
      aria-labelledby="theme-kits"
      className="border-b border-sidebar-border px-3 pt-1 pb-2.5"
    >
      <div className="flex h-6 items-center justify-between gap-2">
        <h3 id="theme-kits" className="text-xs font-semibold">
          Kits
        </h3>
        <span className="text-label text-muted-foreground">
          {added.length > 0 ? `${added.length} in project` : null}
        </span>
      </div>
      {added.length === 0 ? (
        <p className="pt-0.5 pb-1 leading-[1.45] text-muted-foreground">
          No kits yet. Add one, then set it on frames in the inspector.
        </p>
      ) : (
        <ul>
          {added.map((kit) => (
            <li
              key={kit.name}
              className="group flex h-7 items-center gap-2 text-xs"
            >
              <span className="min-w-0 flex-1 truncate">{kit.title}</span>
              <span className="shrink-0 text-label text-muted-foreground tabular-nums">
                {usage(kit.frameCount)}
              </span>
              <button
                type="button"
                aria-label={`Remove ${kit.title}`}
                disabled={!canWrite}
                onClick={() =>
                  kit.frameCount > 0 ? setRemoving(kit) : remove(kit)
                }
                className="grid size-5 shrink-0 place-items-center rounded-[5px] text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40"
              >
                <X aria-hidden className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <AddKit
        project={project}
        added={added}
        disabled={!canWrite}
        loadKits={loadKits}
        calls={calls}
      />
      <Dialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null)
        }}
      >
        <DialogContent showCloseButton={false} className="gap-3 p-4">
          <DialogTitle className="text-title font-semibold">
            Remove {removing?.title}?
          </DialogTitle>
          <DialogDescription>
            {removing ? usedBy(removing.frameCount) : null} go back to the
            project’s look. Undo brings the kit and its frames back.
          </DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (removing) remove(removing)
                setRemoving(null)
              }}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}

interface AddKitProps {
  project: string
  added: readonly ProjectKitRecord[]
  disabled: boolean
  loadKits?: () => Promise<KitRecord[] | null>
  calls: Pick<Structure, 'installKit'>
}

function AddKit({ project, added, disabled, loadKits, calls }: AddKitProps) {
  const open = useStore(addKitStore, (state) => state.open)
  const frame = useSelectedFrame()

  return (
    <DropdownMenu
      open={open && !disabled}
      onOpenChange={(next) => addKitStore.setState({ open: next })}
    >
      <DropdownMenuTrigger
        disabled={disabled}
        className="mt-1 -ml-1 flex h-6 items-center gap-1 rounded-[5px] px-1 text-xs font-medium text-primary outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40 aria-expanded:bg-accent"
      >
        <Plus aria-hidden className="size-3" />
        Add kit
      </DropdownMenuTrigger>
      <ChromeMenuContent
        align="start"
        sideOffset={4}
        className="w-auto min-w-[220px]"
      >
        <KitItems
          project={project}
          added={added}
          loadKits={loadKits}
          calls={calls}
        />
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={frame === null}
          onClick={() => {
            if (frame) askOnFrame(frame, ASK_FOR_KIT)
          }}
          className={cn(
            MENU_ROW,
            'h-auto flex-col items-start gap-0 py-1 font-medium text-primary',
          )}
        >
          Ask the agent for a new kit
          {frame === null ? (
            <span className="font-normal text-muted-foreground">
              Select a frame to pin the note on
            </span>
          ) : null}
        </DropdownMenuItem>
      </ChromeMenuContent>
    </DropdownMenu>
  )
}

/**
 * The kits the board can add, read as the list opens, since the menu mounts
 * its items only while open.
 */
function KitItems({
  project,
  added,
  loadKits,
  calls,
}: Omit<AddKitProps, 'disabled'>) {
  const kits = useKits(loadKits)
  if (kits === undefined) {
    return <p className="px-2 py-1 text-muted-foreground">Loading kits</p>
  }
  if (kits === null) {
    return (
      <p className="px-2 py-1 text-muted-foreground">
        The kits did not load. Reopen the list to try again.
      </p>
    )
  }
  return (
    <DropdownMenuGroup>
      {kits.map((kit) => {
        const isAdded = added.some(({ name }) => name === kit.name)
        return (
          <DropdownMenuItem
            key={kit.name}
            disabled={isAdded}
            onClick={() => {
              calls
                .installKit(project, kit.name)
                .catch(reportRefusal('Couldn’t add the kit'))
            }}
            className={cn(MENU_ROW, 'pr-4 whitespace-nowrap')}
          >
            {kit.title}
            {isAdded ? (
              <span className="text-muted-foreground">added</span>
            ) : kit.source === 'board' ? (
              <span className="text-muted-foreground">saved on this board</span>
            ) : null}
          </DropdownMenuItem>
        )
      })}
    </DropdownMenuGroup>
  )
}

/** The one frame the selection names, or the frame of a selected element, null with none or several. */
function useSelectedFrame(): FrameRecord | null {
  const ref = useStore(selectionStore, ({ frames, element }) =>
    frames.length === 1 ? (frames[0] ?? null) : (element?.frame ?? null),
  )
  return useLive((state) => (ref ? frameOf(state.board, ref) : null))
}

function projectOf(board: ListResult | null, name: string) {
  return board?.projects.find((project) => project.name === name)
}

function frameOf(board: ListResult | null, ref: string): FrameRecord | null {
  for (const project of board?.projects ?? []) {
    for (const page of project.pages) {
      const frame = page.frames.find((candidate) => candidate.ref === ref)
      if (frame) return frame
    }
  }
  return null
}

function usage(count: number): string {
  if (count === 0) return 'not used'
  return count === 1 ? '1 frame' : `${count} frames`
}

function usedBy(count: number): string {
  return count === 1 ? 'The 1 frame using it' : `The ${count} frames using it`
}
