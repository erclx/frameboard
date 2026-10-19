import { cn } from 'cn'
import {
  ChevronDown,
  ChevronRight,
  ListChevronsUpDown,
  Square,
} from 'lucide-react'
import { useEffect, useState } from 'react'

import type { FrameRecord } from '@/shared/records/list'

import { treeOf, trees } from '../element/tree'
import { up } from '../element/walk'
import {
  type ElementKey,
  type SelectionState,
  selectionStore,
  useSelection,
} from '../selection'
import { ElementRows } from './element-rows'
import { PanelSection } from './section'

interface LayersListProps {
  frames: readonly FrameRecord[]
}

/**
 * The page's frames in stacking order, each opening onto its elements, with
 * a hidden frame dimmed. A selected element opens its frame and the rows
 * above it, and the header's button closes every row. A frame selected, or
 * one holding the selected element, draws as one tinted band with its rows.
 */
export function LayersList({ frames }: LayersListProps) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const page = useSelection((state) => state.page)
  const selectedFrames = useSelection((state) => state.frames)
  const element = useSelection((state) => state.element ?? null)
  useRevealSelected(setExpanded)

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
          {frames.map((frame) => {
            const open = isOpen(frame.ref)
            const holdsElement = element?.frame === frame.ref
            const frameSelected =
              !holdsElement &&
              page === pageOf(frame) &&
              selectedFrames.includes(frame.ref)
            return (
              <li
                key={frame.ref}
                aria-label={frame.hidden ? `${frame.name}, hidden` : frame.name}
                className="mx-1.5 flex flex-col overflow-hidden rounded-md"
              >
                <div
                  className={cn(
                    'flex h-[26px] items-center gap-1.5 pr-2 pl-2 text-foreground',
                    frame.hidden && 'text-faint',
                    frameSelected
                      ? 'bg-primary/26'
                      : holdsElement
                        ? 'bg-primary/7'
                        : undefined,
                  )}
                >
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
                  <Square
                    aria-hidden
                    className={cn(
                      'size-[13px] shrink-0',
                      frame.hidden ? 'text-faint' : 'text-muted-foreground',
                    )}
                  />
                  <span className="min-w-0 flex-1 truncate" title={frame.name}>
                    {frame.name}
                  </span>
                </div>
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
              </li>
            )
          })}
        </ul>
      )}
    </section>
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
