import { cn } from 'cn'
import {
  ChevronDown,
  ChevronRight,
  RectangleHorizontal,
  Type,
} from 'lucide-react'

import type { TreeElement } from '@/shared/records/elements'
import type { FrameRecord } from '@/shared/records/list'

import { useElementTree } from '../element/tree'
import { selectElement, selectionStore } from '../selection'

/** How far each level of nesting moves a row in, past the frame row's own 8 px. */
const INDENT = 14
const FRAME_INSET = 8

interface ElementRowsProps {
  frame: FrameRecord
  /** The page the frame sits on, which a row click selects on. */
  page: string
  /** The selected element's index in this frame, null when none is. */
  selected: number | null
  /** True while the frame itself is selected, which tints its rows below its own. */
  frameSelected: boolean
  /** Whether the row of the element at this index shows its children. */
  isOpen: (index: number) => boolean
  toggle: (index: number) => void
}

/**
 * One frame's element rows, read from the server's tree so a culled frame
 * lists them too, each indented by depth, with a `Type` icon for an element
 * holding text alone, a chevron on one with children, and a click selecting
 * the element. The selected row is tinted deeper than the rest of its
 * frame's band, as `layers/edit` and `inspector/text` draw them.
 */
export function ElementRows({
  frame,
  page,
  selected,
  frameSelected,
  isOpen,
  toggle,
}: ElementRowsProps) {
  const entry = useElementTree(frame.ref)
  if (!entry || entry.status === 'loading') {
    return <Notice depth={1}>Reading elements</Notice>
  }
  if (entry.status === 'refused') {
    return (
      <Notice depth={1} title={entry.message}>
        This frame cannot be addressed
      </Notice>
    )
  }
  const { tree } = entry
  const rows = visibleRows(tree.elements, isOpen)
  if (rows.length === 0) return <Notice depth={1}>No elements</Notice>
  const parents = new Set(tree.elements.map((element) => element.parent))
  return (
    <ul aria-label={`Elements of ${frame.name}`}>
      {rows.map(({ element, depth }) => {
        const open = isOpen(element.index)
        const isSelected = element.index === selected
        const Icon = element.textOnly ? Type : RectangleHorizontal
        return (
          <li
            key={element.index}
            className={cn(
              'flex h-[26px] items-center gap-1.5 pr-2 text-foreground',
              isSelected
                ? 'bg-primary/26'
                : frameSelected
                  ? 'bg-primary/13'
                  : selected !== null
                    ? 'bg-primary/7'
                    : 'hover:bg-accent',
            )}
            style={{ paddingLeft: FRAME_INSET + depth * INDENT }}
          >
            {parents.has(element.index) ? (
              <button
                type="button"
                aria-label={`${open ? 'Hide' : 'Show'} what ${element.name} holds`}
                aria-expanded={open}
                onClick={() => toggle(element.index)}
                className="grid w-2.5 shrink-0 place-items-center text-faint outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {open ? (
                  <ChevronDown aria-hidden className="size-2.5" />
                ) : (
                  <ChevronRight aria-hidden className="size-2.5" />
                )}
              </button>
            ) : (
              <span aria-hidden className="w-2.5 shrink-0" />
            )}
            <button
              type="button"
              aria-current={isSelected ? 'true' : undefined}
              onClick={() =>
                selectElement(selectionStore, page, {
                  frame: frame.ref,
                  index: element.index,
                  hash: tree.hash,
                })
              }
              className="flex min-w-0 flex-1 items-center gap-1.5 self-stretch text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
            >
              <Icon
                aria-hidden
                className={cn(
                  'size-[13px] shrink-0',
                  isSelected ? 'text-primary' : 'text-muted-foreground',
                )}
              />
              <span className="min-w-0 flex-1 truncate" title={element.name}>
                {element.name}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function Notice({
  depth,
  title,
  children,
}: {
  depth: number
  title?: string
  children: string
}) {
  return (
    <p
      title={title}
      className="flex h-[26px] items-center truncate pr-2 text-faint"
      style={{ paddingLeft: FRAME_INSET + depth * INDENT + 16 }}
    >
      {children}
    </p>
  )
}

/** The rows an open path shows, in tree order, each with its depth below the frame row. */
function visibleRows(
  elements: readonly TreeElement[],
  isOpen: (index: number) => boolean,
): { element: TreeElement; depth: number }[] {
  const depthOf = new Map<number, number>()
  const rows: { element: TreeElement; depth: number }[] = []
  for (const element of elements) {
    if (element.parent === null) {
      depthOf.set(element.index, 1)
      rows.push({ element, depth: 1 })
      continue
    }
    const parentDepth = depthOf.get(element.parent)
    // A row whose parent is hidden or closed stays out, and so do its own children.
    if (parentDepth === undefined || !isOpen(element.parent)) continue
    depthOf.set(element.index, parentDepth + 1)
    rows.push({ element, depth: parentDepth + 1 })
  }
  return rows
}
