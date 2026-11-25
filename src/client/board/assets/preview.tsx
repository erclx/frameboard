import { type ReactNode, useEffect } from 'react'
import { useStore } from 'zustand'

import {
  frameInView,
  placeAtCenter,
  placeInFrame,
} from '@/client/board/place/write'
import { useSelection } from '@/client/board/selection'
import { canvasView } from '@/client/board/view'
import { Button } from '@/client/components/ui/button'
import { Skeleton } from '@/client/components/ui/skeleton'
import { toast } from '@/client/components/ui/toast'
import { cn } from '@/client/lib/cn'
import { useLive } from '@/client/live/store'

import type { PlaceableFile } from './drag'
import { closeSourcing, sourcingDialogStore } from './open-dialog'
import type { SaveState } from './sourcing'

/** Where Insert lands: the one selected frame while part of it is in view, else the canvas. */
type InsertTarget =
  | { kind: 'frame'; page: string; ref: string; name: string }
  | { kind: 'canvas'; page: string }

interface PreviewProps {
  project: string
  /** Names the file among every one Find and Generate show, so an insert follows it past a pick. */
  id: string
  picture: ReactNode
  title: string
  lines: readonly string[]
  /** The result's save, absent for a file already in `assets/`. */
  save?: { state: SaveState | undefined; run: () => void }
  /** Answers the file Insert lands, saving it first where it is not saved yet. */
  file: () => Promise<PlaceableFile>
  /** Whether Insert is its view's one blue button. */
  primary?: boolean
  /** Lands a file in the named frame, `placeInFrame` in the app. */
  placeFrame?: typeof placeInFrame
  /** Lands a file in a frame of its own, `placeAtCenter` in the app. */
  placeCanvas?: typeof placeAtCenter
}

/**
 * The picked result beside the grid, larger, with Save and Insert, in its own
 * column where the view is wide and under the grid where it is not.
 */
export function Preview({
  project,
  id,
  picture,
  title,
  lines,
  save,
  file,
  primary = false,
  placeFrame = placeInFrame,
  placeCanvas = placeAtCenter,
}: PreviewProps) {
  const canWrite = useLive((state) => state.canWrite)
  const inserting = useStore(sourcingDialogStore, (state) => state.inserting)
  const refusal = useStore(sourcingDialogStore, (state) => state.refusal)
  const target = useInsertTarget()
  // A refusal is drawn on the file it is about, and goes with its pane.
  useEffect(() => {
    sourcingDialogStore.setState({ shown: id, refusal: null })
    return () => sourcingDialogStore.setState({ shown: null, refusal: null })
  }, [id])
  const failed = save?.state?.state === 'failed' ? save.state.message : null
  const problem = refusal ?? failed
  return (
    <PreviewPane>
      <div className={PICTURE}>{picture}</div>
      <div className="flex max-h-24 min-w-0 flex-col gap-1 overflow-y-auto @min-[640px]:max-h-none @min-[640px]:min-h-0 @min-[640px]:flex-1 @min-[640px]:gap-2">
        <h3 className="text-panel [overflow-wrap:anywhere]">{title}</h3>
        {lines.map((line) => (
          <p
            key={line}
            className="[overflow-wrap:anywhere] text-muted-foreground"
          >
            {line}
          </p>
        ))}
        <p role="status" className="text-muted-foreground">
          {save && canWrite ? saveLine(save.state) : null}
        </p>
      </div>
      <div className="col-span-2 flex flex-col gap-2">
        {problem ? (
          <p
            role="alert"
            className="[overflow-wrap:anywhere] text-label font-normal text-destructive"
          >
            {problem}
          </p>
        ) : null}
        {canWrite ? (
          <div className="flex gap-2 @min-[640px]:flex-col">
            {save ? (
              <Button
                variant="outline"
                size="sm"
                className={cn(BUTTON, OUTLINE)}
                disabled={save.state?.state === 'saving'}
                focusableWhenDisabled
                onClick={() => {
                  sourcingDialogStore.setState({ refusal: null })
                  save.run()
                }}
              >
                {SAVE_LABEL[save.state?.state ?? 'idle']}
              </Button>
            ) : null}
            {target ? (
              <Button
                variant={primary ? 'default' : 'outline'}
                size="sm"
                className={cn(BUTTON, !primary && OUTLINE)}
                disabled={inserting !== null}
                focusableWhenDisabled
                onClick={() =>
                  void insert({ project, file: id }, target, file, {
                    placeFrame,
                    placeCanvas,
                  })
                }
              >
                <span className="truncate">
                  {inserting?.file === id ? 'Inserting…' : insertLabel(target)}
                </span>
              </Button>
            ) : null}
          </div>
        ) : (
          <p className="text-label font-normal text-muted-foreground">
            This tab is read-only, so nothing can be saved or inserted. Run{' '}
            <code className="font-mono text-foreground">frameboard open</code>{' '}
            for a tab that can.
          </p>
        )}
      </div>
    </PreviewPane>
  )
}

/** The pane's shape, held grey while what fills it is on its way. */
export function PreviewSkeleton() {
  return (
    <PreviewPane>
      <div className={PICTURE} />
      <div className="flex flex-col gap-2 pt-1">
        <Skeleton className="h-2.5 w-[70%] rounded-[3px] bg-foreground/10" />
        <Skeleton className="h-2 w-[45%] rounded-[3px] bg-foreground/10" />
      </div>
    </PreviewPane>
  )
}

function PreviewPane({ children }: { children: ReactNode }) {
  return (
    <section
      aria-label="Preview"
      className="grid shrink-0 grid-cols-[96px_minmax(0,1fr)] content-start gap-x-3 gap-y-2 border-t border-border p-4 @min-[640px]:flex @min-[640px]:min-h-0 @min-[640px]:w-[280px] @min-[640px]:flex-col @min-[640px]:border-t-0 @min-[640px]:border-l"
    >
      {children}
    </section>
  )
}

const PICTURE =
  'h-[72px] shrink-0 overflow-hidden rounded-md bg-accent @min-[640px]:h-[200px] *:size-full'

const BUTTON =
  'min-w-0 flex-1 text-xs aria-disabled:opacity-50 @min-[640px]:flex-none'

/** The panel's own fill, where the kit's outline button takes the canvas grey. */
const OUTLINE = 'bg-card dark:bg-card'

const SAVE_LABEL = {
  idle: 'Save to assets',
  saving: 'Saving…',
  saved: 'Saved to assets',
  failed: 'Save to assets',
} as const

/** Where the file went, or will go, with the license beside it. */
function saveLine(state: SaveState | undefined): string {
  return state?.state === 'saved'
    ? `Saved as assets/${state.path} with its license beside it`
    : 'Saves into assets/ with its license beside it'
}

function insertLabel(target: InsertTarget): string {
  return target.kind === 'frame'
    ? `Insert into ${target.name}`
    : 'Insert on canvas'
}

/** Where Insert would land now, null with no canvas to land on. */
function useInsertTarget(): InsertTarget | null {
  const selected = useSelection((state) =>
    state.frames.length === 1 ? (state.frames[0] ?? null) : null,
  )
  // Read again as a frame moves, is renamed, or goes.
  useLive((state) => state.board)
  const page = canvasView.page()
  if (page === null) return null
  const shown = selected === null ? null : frameInView(selected)
  return shown
    ? { kind: 'frame', page, ref: shown.frame.ref, name: shown.frame.name }
    : { kind: 'canvas', page }
}

/**
 * Saves the file where it is not saved yet, lands it, and closes its project's
 * dialog, one insert at a time. A refusal keeps the dialog and says why on the
 * file it is about, or toasts once that file's preview is gone.
 */
async function insert(
  inserting: { project: string; file: string },
  target: InsertTarget,
  file: () => Promise<PlaceableFile>,
  place: Required<Pick<PreviewProps, 'placeFrame' | 'placeCanvas'>>,
): Promise<void> {
  if (sourcingDialogStore.getState().inserting) return
  sourcingDialogStore.setState({ inserting, refusal: null })
  let refusal: string | null
  try {
    refusal = await land(target, await file(), place)
  } catch (error) {
    refusal = reasonOf(error)
  }
  sourcingDialogStore.setState({ inserting: null })
  const { project, shown } = sourcingDialogStore.getState()
  if (refusal === null) {
    if (project === inserting.project) closeSourcing()
  } else if (shown === inserting.file) {
    sourcingDialogStore.setState({ refusal })
  } else {
    toast.add({
      title: 'Nothing inserted',
      description: refusal,
      type: 'warning',
    })
  }
}

/** Lands a file at the target, answering why it was refused, null once it landed. */
async function land(
  target: InsertTarget,
  file: PlaceableFile,
  { placeFrame, placeCanvas }: Parameters<typeof insert>[3],
): Promise<string | null> {
  if (canvasView.page() !== target.page) {
    return 'The canvas moved to another page, so nothing was inserted.'
  }
  let reason: string | null = null
  if (target.kind === 'frame') {
    const placed = await placeFrame(target.ref, file, {
      notify: ({ description }) => {
        reason = description
      },
    })
    if (placed) return null
    return (
      reason ??
      `${target.name} is out of view or still loading, so nothing was inserted.`
    )
  }
  const added = await placeCanvas(file, {
    report: (error) => {
      reason = reasonOf(error)
    },
  })
  return added ? null : (reason ?? 'No frame could be added to this page.')
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
