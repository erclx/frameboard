import { cn } from 'cn'
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  ListChevronsUpDown,
  Lock,
  LockOpen,
  Square,
} from 'lucide-react'
import {
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'

import { RenameField } from '@/client/components/rename-field'
import { useLive } from '@/client/live/store'
import {
  type FrameFlag,
  type Structure,
  structure,
} from '@/client/live/structure'
import type { FrameRecord } from '@/shared/records/list'

import { treeOf, trees } from '../element/tree'
import { up } from '../element/walk'
import { modeStore } from '../mode'
import {
  type ElementKey,
  select,
  type SelectionState,
  selectionStore,
  toggle as toggleSelected,
  useSelection,
} from '../selection'
import {
  renameFrame,
  startFrameRename,
  stopFrameRename,
  useRenamingFrame,
} from '../structure/actions'
import { DropLine } from './drop-line'
import { ElementRows } from './element-rows'
import { reportRefusal } from './page-actions'
import { useReorderMonitor, useReorderRow } from './reorder'
import { PanelSection } from './section'

interface LayersListProps {
  /** The page's frames as the server sends them, bottom of the stack first. */
  frames: readonly FrameRecord[]
  /** The server calls a row writes through, the board's own when absent. */
  calls?: Structure
}

const LIST = 'layers'

/**
 * The page's frames top of the stack first, each opening onto its elements,
 * with a hidden frame dimmed. A row click selects its frame and Shift-click
 * adds or takes it out, a double-click or F2 renames it, a drag restacks it,
 * and its eye and lock show on hover and stay while on. A hidden frame does
 * not select, since the next board would prune it, and its eye unhides it.
 * A selected element opens its frame and the rows above it, and the
 * header's button closes every row. A frame selected, or one holding the
 * selected element, draws as one tinted band with its rows.
 */
export function LayersList({ frames, calls = structure }: LayersListProps) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const page = useSelection((state) => state.page)
  const selectedFrames = useSelection((state) => state.frames)
  const element = useSelection((state) => state.element ?? null)
  const canWrite = useLive((state) => state.canWrite)
  useRevealSelected(setExpanded)
  const stack = [...frames].reverse()

  // A row lands at a place in the list, which counts from the top of the
  // stack, while the server counts its index from the bottom.
  const move = useCallback(
    (from: number, to: number) => {
      const shown = [...frames].reverse()
      const frame = shown[from]
      if (!frame) return
      calls
        .orderFrame(frame.ref, shown.length - 1 - to)
        .catch(reportRefusal(`Couldn't move ${frame.name}`))
    },
    [frames, calls],
  )
  useReorderMonitor(LIST, move)

  const isOpen = (key: string) => expanded.has(key)
  const toggle = (key: string) =>
    setExpanded((open) => {
      const next = new Set(open)
      if (!next.delete(key)) next.add(key)
      return next
    })

  return (
    <section aria-labelledby="layers-heading" className="flex min-h-0 flex-col">
      <PanelSection id="layers-heading" title="Layers">
        <button
          type="button"
          aria-label="Collapse all layers"
          title="Collapse all layers"
          onClick={() => setExpanded(new Set())}
          className="grid size-5 place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ListChevronsUpDown aria-hidden className="size-[15px]" />
        </button>
      </PanelSection>
      {frames.length === 0 ? (
        <p className="px-3.5 py-1 text-faint">No frames on this page</p>
      ) : (
        <ul className="flex min-h-0 flex-col overflow-y-auto pb-1">
          {stack.map((frame, index) => {
            const open = isOpen(frame.ref)
            const holdsElement = element?.frame === frame.ref
            const frameSelected =
              !holdsElement &&
              page === pageOf(frame) &&
              selectedFrames.includes(frame.ref)
            return (
              <FrameRow
                key={frame.ref}
                frame={frame}
                index={index}
                canWrite={canWrite}
                calls={calls}
                tint={
                  frameSelected
                    ? 'bg-primary/26'
                    : holdsElement
                      ? 'bg-primary/7'
                      : undefined
                }
                chevron={
                  <button
                    type="button"
                    aria-label={`${open ? 'Hide' : 'Show'} the elements of ${frame.name}`}
                    aria-expanded={open}
                    onClick={() => toggle(frame.ref)}
                    className="grid w-2.5 shrink-0 place-items-center text-faint outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    {open ? (
                      <ChevronDown aria-hidden className="size-2.5" />
                    ) : (
                      <ChevronRight aria-hidden className="size-2.5" />
                    )}
                  </button>
                }
              >
                {open ? (
                  <ElementRows
                    frame={frame}
                    page={pageOf(frame)}
                    selected={holdsElement ? (element?.index ?? null) : null}
                    frameSelected={frameSelected}
                    isOpen={(index) => isOpen(rowKey(frame.ref, index))}
                    toggle={(index) => toggle(rowKey(frame.ref, index))}
                  />
                ) : null}
              </FrameRow>
            )
          })}
        </ul>
      )}
    </section>
  )
}

interface FrameRowProps {
  frame: FrameRecord
  /** Its place in the list, counting from the top of the stack. */
  index: number
  canWrite: boolean
  calls: Structure
  /** The selected tint, absent when neither the frame nor one of its elements is selected. */
  tint: string | undefined
  /** The expand toggle, kept apart from the row's own click. */
  chevron: ReactNode
  /** Its element rows, while open. */
  children: ReactNode
}

const ROW_BUTTON =
  'grid size-5 shrink-0 place-items-center rounded-[5px] outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none'

/** Shown on the row's hover or focus alone, for a flag that is off. */
const ON_HOVER =
  'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'

const FLAG_VERBS: Record<FrameFlag, readonly [string, string]> = {
  hidden: ['show', 'hide'],
  locked: ['unlock', 'lock'],
}

function FrameRow({
  frame,
  index,
  canWrite,
  calls,
  tint,
  chevron,
  children,
}: FrameRowProps) {
  const row = useRef<HTMLLIElement>(null)
  const renaming = useRenamingFrame('layers') === frame.ref
  const claim = useLive((state) => state.claims[frame.ref])
  const edge = useReorderRow(row, {
    list: LIST,
    index,
    enabled: canWrite && !renaming,
  })

  const choose = (event: MouseEvent<HTMLButtonElement>) => {
    if (frame.hidden || modeStore.getState().mode !== 'edit') return
    if (event.shiftKey) toggleSelected(selectionStore, pageOf(frame), frame.ref)
    else select(selectionStore, pageOf(frame), [frame.ref])
  }
  const flag = (name: FrameFlag, on: boolean) =>
    calls
      .flagFrames([frame.ref], name, on)
      .catch(
        reportRefusal(`Couldn't ${FLAG_VERBS[name][on ? 1 : 0]} ${frame.name}`),
      )
  const icon = (
    <Square
      aria-hidden
      className={cn(
        'size-[13px] shrink-0',
        frame.hidden ? 'text-faint' : 'text-muted-foreground',
      )}
    />
  )

  return (
    <li
      ref={row}
      aria-label={frame.hidden ? `${frame.name}, hidden` : frame.name}
      className="relative mx-1.5"
    >
      <DropLine edge={edge} />
      {/* Clips the frame's band of rows to one rounded shape, leaving the drop line outside it. */}
      <div className="flex flex-col overflow-hidden rounded-md">
        <div
          className={cn(
            'group flex h-[26px] items-center gap-1.5 pr-1 pl-2 text-foreground',
            frame.hidden && 'text-faint',
            tint ?? 'hover:bg-accent',
          )}
        >
          {chevron}
          {renaming ? (
            <>
              {icon}
              <RenameField
                name={frame.name}
                label={`Rename frame ${frame.name}`}
                onCommit={(name) => {
                  stopFrameRename()
                  void renameFrame(frame, name, calls)
                }}
                onCancel={stopFrameRename}
              />
            </>
          ) : (
            <button
              type="button"
              aria-label={`Select ${frame.name}`}
              onClick={choose}
              onDoubleClick={() => {
                if (canWrite) startFrameRename(frame.ref, 'layers')
              }}
              onKeyDown={(event) => {
                if (event.key !== 'F2' || !canWrite) return
                event.preventDefault()
                startFrameRename(frame.ref, 'layers')
              }}
              className="flex h-full min-w-0 flex-1 items-center gap-1.5 rounded-[5px] text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
            >
              {icon}
              <span className="min-w-0 flex-1 truncate">{frame.name}</span>
            </button>
          )}
          {claim ? (
            <span
              role="img"
              aria-label={`${claim.tag} is editing`}
              className="ml-auto size-[7px] shrink-0 rounded-full bg-claim shadow-[0_0_0_3px_color-mix(in_srgb,var(--claim)_25%,transparent)]"
            />
          ) : null}
          <button
            type="button"
            aria-label={`${frame.hidden ? 'Show' : 'Hide'} ${frame.name}`}
            aria-pressed={frame.hidden}
            disabled={!canWrite}
            onClick={() => void flag('hidden', !frame.hidden)}
            className={cn(
              ROW_BUTTON,
              frame.hidden
                ? 'text-faint'
                : cn('text-muted-foreground', ON_HOVER),
            )}
          >
            {frame.hidden ? (
              <EyeOff aria-hidden className="size-[13px]" />
            ) : (
              <Eye aria-hidden className="size-[13px]" />
            )}
          </button>
          <button
            type="button"
            aria-label={`${frame.locked ? 'Unlock' : 'Lock'} ${frame.name}`}
            aria-pressed={frame.locked}
            disabled={!canWrite}
            onClick={() => void flag('locked', !frame.locked)}
            className={cn(
              ROW_BUTTON,
              'text-muted-foreground',
              !frame.locked && ON_HOVER,
            )}
          >
            {frame.locked ? (
              <Lock aria-hidden className="size-[13px]" />
            ) : (
              <LockOpen aria-hidden className="size-[13px]" />
            )}
          </button>
        </div>
        {children}
      </div>
    </li>
  )
}

/** The expansion key of an element row, beside its frame's, which is the frame ref. */
function rowKey(frame: string, index: number): string {
  return `${frame}#${index}`
}

function pageOf(frame: FrameRecord): string {
  return `${frame.project}/${frame.page}`
}

/**
 * Opens the rows above each newly selected element, its frame first and
 * then every element it sits in, waiting on the frame's tree when it has
 * not arrived yet. It follows the stores rather than rendering from them, so
 * collapsing all afterwards closes those rows too.
 */
function useRevealSelected(
  setExpanded: (
    change: (open: ReadonlySet<string>) => ReadonlySet<string>,
  ) => void,
): void {
  useEffect(() => {
    let pending: ElementKey | null = null
    const reveal = () => {
      const target = pending
      if (!target) return
      const tree = treeOf(target.frame)
      const keys = [target.frame]
      if (tree) {
        pending = null
        for (
          let parent = up(tree.elements, target.index);
          typeof parent === 'number';
          parent = up(tree.elements, parent)
        ) {
          keys.push(rowKey(target.frame, parent))
        }
      }
      setExpanded((open) =>
        keys.every((key) => open.has(key)) ? open : new Set([...open, ...keys]),
      )
    }
    const onSelection = (state: SelectionState, previous: SelectionState) => {
      if (!state.element || state.element === previous.element) return
      pending = state.element
      reveal()
    }
    const stopSelection = selectionStore.subscribe(onSelection)
    const stopTrees = trees.store.subscribe(reveal)
    return () => {
      stopTrees()
      stopSelection()
    }
  }, [setExpanded])
}
