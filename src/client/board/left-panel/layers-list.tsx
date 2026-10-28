import { cn } from 'cn'
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Frame,
  ListChevronsUpDown,
  Lock,
  LockOpen,
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
import { useUnseen } from '@/client/live/unseen'
import type { FrameRecord, SectionRecord } from '@/shared/records/list'

import { UnseenDot } from '../changes/dot'
import { treeOf, trees } from '../element/tree'
import { up } from '../element/walk'
import { withDrawn } from '../geometry/write'
import { FrameRowMenu } from '../menus/layers'
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
import { canvasView } from '../view'
import { DropLine } from './drop-line'
import { ElementRows } from './element-rows'
import { reportRefusal } from './page-actions'
import { useReorderMonitor, useReorderRow } from './reorder'
import { PanelSection } from './section'
import { SectionRow } from './section-rows'

interface LayersListProps {
  /** The page's frames as the server sends them, bottom of the stack first. */
  frames: readonly FrameRecord[]
  /** The page's sections as the server sends them, bottom first, each naming the frames it holds. */
  sections?: readonly SectionRecord[]
  /** The server calls a row writes through, the board's own when absent. */
  calls?: Structure
}

const LIST = 'layers'
/** A section's frames restack among themselves alone, as their own list. */
const SECTION_LIST = 'layers:section:'
const inLayers = (list: string) =>
  list === LIST || list.startsWith(SECTION_LIST)
const NO_SECTIONS: readonly SectionRecord[] = []

/**
 * The page's frames top of the stack first, each opening onto its elements,
 * with a hidden frame dimmed. A row click selects its frame and Shift-click
 * adds or takes it out, a double-click or F2 renames it, a drag restacks it,
 * and its eye and lock show on hover and stay while on. A hidden frame does
 * not select, since the next board would prune it, and its eye unhides it.
 * A selected element opens its frame and the rows above it, and the
 * header's button closes every row. A frame selected, or one holding the
 * selected element, draws as one tinted band with its rows. A section's row
 * holds its frames' rows under it, then the frames in no section follow, and
 * a row restacks within its own group, never into or out of a section.
 */
export function LayersList({
  frames,
  sections = NO_SECTIONS,
  calls = structure,
}: LayersListProps) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const page = useSelection((state) => state.page)
  const selectedSection = useSelection((state) => state.section)
  const selectedFrames = useSelection((state) => state.frames)
  const element = useSelection((state) => state.element ?? null)
  const canWrite = useLive((state) => state.canWrite)
  useRevealSelected(setExpanded)
  const groups = groupsOf(frames, sections)

  // A row lands at a place in its group, which counts from the top of the
  // stack, while the server counts a page-wide index from the bottom. The
  // frame goes beside the neighbor it lands by, so the canvas draws it over
  // or under that frame whatever sits between them in the page's stack.
  const move = useCallback(
    (from: number, to: number, list: string) => {
      const group = groupsOf(frames, sections).find(
        (candidate) => candidate.list === list,
      )
      const frame = group?.rows[from]
      if (!group || !frame) return
      const rest = group.rows.filter((row) => row.ref !== frame.ref)
      const stack = frames.filter((row) => row.ref !== frame.ref)
      const above = rest[to]
      const below = rest[to - 1]
      const index = above
        ? stack.findIndex((row) => row.ref === above.ref) + 1
        : below
          ? stack.findIndex((row) => row.ref === below.ref)
          : 0
      calls
        .orderFrame(frame.ref, index)
        .catch(reportRefusal(`Couldn't move ${frame.name}`))
    },
    [frames, sections, calls],
  )
  useReorderMonitor(inLayers, move)

  const isOpen = (key: string) => expanded.has(key)
  const toggle = (key: string) =>
    setExpanded((open) => {
      const next = new Set(open)
      if (!next.delete(key)) next.add(key)
      return next
    })

  const frameRow = (frame: FrameRecord, index: number, list: string) => {
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
        list={list}
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
            className="-mr-1.5 -ml-[7px] grid size-6 shrink-0 place-items-center text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
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
  }

  return (
    <section aria-labelledby="layers-heading" className="flex min-h-0 flex-col">
      <PanelSection id="layers-heading" title="Layers">
        <button
          type="button"
          aria-label="Collapse all layers"
          title="Collapse all layers"
          onClick={() => {
            setExpanded(new Set())
            setCollapsed(new Set(sections.map((section) => section.name)))
          }}
          className="group/target grid size-6 place-items-center text-muted-foreground outline-none hover:text-foreground"
        >
          <span className="grid size-5 place-items-center rounded-md group-hover/target:bg-accent group-focus-visible/target:ring-3 group-focus-visible/target:ring-ring/50">
            <ListChevronsUpDown aria-hidden className="size-[15px]" />
          </span>
        </button>
      </PanelSection>
      {frames.length === 0 ? (
        <p className="px-3.5 py-1 text-muted-foreground">
          No frames on this page
        </p>
      ) : (
        <ul className="flex min-h-0 flex-col overflow-y-auto pb-1">
          {groups.map((group) => {
            const rows = group.rows.map((frame, index) =>
              frameRow(frame, index, group.list),
            )
            if (!group.section) return rows
            const { section } = group
            const holdsSelected = group.rows.some(
              (frame) =>
                selectedFrames.includes(frame.ref) ||
                element?.frame === frame.ref,
            )
            return (
              <SectionRow
                key={`${SECTION_LIST}${section.name}`}
                section={section}
                page={pageOfFrames(frames)}
                open={!collapsed.has(section.name) || holdsSelected}
                onToggle={() =>
                  setCollapsed((shut) => {
                    const next = new Set(shut)
                    if (!next.delete(section.name)) next.add(section.name)
                    return next
                  })
                }
                selected={selectedSection === section.name}
                canWrite={canWrite}
                calls={calls}
              >
                {rows}
              </SectionRow>
            )
          })}
        </ul>
      )}
    </section>
  )
}

interface FrameRowProps {
  frame: FrameRecord
  /** Its place in its group, counting from the top of the stack. */
  index: number
  /** The reorder list of its group, which a drag stays within. */
  list: string
  canWrite: boolean
  calls: Structure
  /** The selected tint, absent when neither the frame nor one of its elements is selected. */
  tint: string | undefined
  /** The expand toggle, kept apart from the row's own click. */
  chevron: ReactNode
  /** Its element rows, while open. */
  children: ReactNode
}

/** A 24px target drawing the 20px fill the references draw, through `ROW_FILL`. */
const ROW_BUTTON =
  'group/target grid size-6 shrink-0 place-items-center outline-none hover:text-foreground disabled:pointer-events-none'

/**
 * A hidden row's name and glyphs, dimmed yet past 4.5:1 on a hovered row,
 * since a hidden row still renames and restacks.
 */
const HIDDEN_TEXT =
  'text-[color-mix(in_srgb,var(--muted-foreground)_70%,var(--foreground))]'

const ROW_FILL =
  'grid size-5 place-items-center rounded-[5px] group-hover/target:bg-accent group-focus-visible/target:ring-2 group-focus-visible/target:ring-ring/50'

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
  list,
  canWrite,
  calls,
  tint,
  chevron,
  children,
}: FrameRowProps) {
  const row = useRef<HTMLLIElement>(null)
  const renaming = useRenamingFrame('layers') === frame.ref
  const claim = useLive((state) => state.claims[frame.ref])
  const unseen = useUnseen((state) => frame.ref in state.unseen)
  const edge = useReorderRow(row, {
    list,
    index,
    enabled: canWrite && !renaming,
  })

  const choose = (event: MouseEvent<HTMLButtonElement>) => {
    if (frame.hidden || modeStore.getState().mode !== 'edit') return
    if (event.shiftKey) toggleSelected(selectionStore, pageOf(frame), frame.ref)
    else select(selectionStore, pageOf(frame), [frame.ref])
    // A preview draws the frame wider than its stored box, so reveal what draws.
    const [drawn] = withDrawn([frame])
    if (drawn && selectionStore.getState().frames.includes(frame.ref)) {
      canvasView.reveal(drawn.box)
    }
  }
  const flag = (name: FrameFlag, on: boolean) =>
    calls
      .flagFrames([frame.ref], name, on)
      .catch(
        reportRefusal(`Couldn't ${FLAG_VERBS[name][on ? 1 : 0]} ${frame.name}`),
      )
  const icon = (
    <Frame
      aria-hidden
      className={cn(
        'size-[13px] shrink-0',
        frame.hidden ? HIDDEN_TEXT : 'text-muted-foreground',
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
        <FrameRowMenu
          frame={frame}
          page={pageOf(frame)}
          trigger={
            <div
              className={cn(
                'group flex h-[26px] items-center gap-1.5 pr-1 pl-2 text-foreground',
                frame.hidden && HIDDEN_TEXT,
                tint ?? 'hover:bg-accent',
              )}
            >
              {chevron}
              {renaming ? (
                <>
                  {icon}
                  {/* The slot takes the row's free width, so the hugging field leaves the trailing buttons at the edge. */}
                  <span className="flex min-w-0 flex-1">
                    <RenameField
                      hug
                      name={frame.name}
                      label={`Rename frame ${frame.name}`}
                      onCommit={(name) => {
                        stopFrameRename()
                        void renameFrame(frame, name, calls)
                      }}
                      onCancel={stopFrameRename}
                    />
                  </span>
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
                    // The board's F2 renames in the inspector, so this row's keeps it here.
                    event.stopPropagation()
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
              ) : unseen ? (
                <UnseenDot />
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
                    ? HIDDEN_TEXT
                    : cn('text-muted-foreground', ON_HOVER),
                )}
              >
                <span className={ROW_FILL}>
                  {frame.hidden ? (
                    <EyeOff aria-hidden className="size-[13px]" />
                  ) : (
                    <Eye aria-hidden className="size-[13px]" />
                  )}
                </span>
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
                <span className={ROW_FILL}>
                  {frame.locked ? (
                    <Lock aria-hidden className="size-[13px]" />
                  ) : (
                    <LockOpen aria-hidden className="size-[13px]" />
                  )}
                </span>
              </button>
            </div>
          }
        />
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

/** The page every frame in the list sits on, read off the first. */
function pageOfFrames(frames: readonly FrameRecord[]): string {
  const [first] = frames
  return first ? pageOf(first) : ''
}

interface Group {
  /** The reorder list its rows drag within. */
  list: string
  /** The section holding the rows, absent for the frames in none. */
  section?: SectionRecord
  /** Top of the stack first. */
  rows: readonly FrameRecord[]
}

/** The rows as Layers groups them: each section top first with its frames, then the frames in no section. */
function groupsOf(
  frames: readonly FrameRecord[],
  sections: readonly SectionRecord[],
): Group[] {
  const top = [...frames].reverse()
  const held = new Set(sections.flatMap((section) => section.frames))
  return [
    ...[...sections].reverse().map((section) => ({
      list: `${SECTION_LIST}${section.name}`,
      section,
      rows: top.filter((frame) => section.frames.includes(frame.name)),
    })),
    { list: LIST, rows: top.filter((frame) => !held.has(frame.name)) },
  ]
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
