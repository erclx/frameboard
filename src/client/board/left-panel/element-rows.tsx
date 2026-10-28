import { cn } from 'cn'
import { ChevronDown, ChevronRight, type LucideIcon } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'

import { RenameField } from '@/client/components/rename-field'
import { useLive } from '@/client/live/store'
import type { TreeElement } from '@/shared/records/elements'
import type { FrameRecord } from '@/shared/records/list'

import { useElementTree } from '../element/tree'
import { writeElement } from '../inspector/element/write'
import { ElementRowMenu } from '../menus/layers'
import { moveElementTo } from '../place/write'
import { type ElementKey, selectElement, selectionStore } from '../selection'
import { DropLine } from './drop-line'
import { elementGlyph } from './layer-glyphs'
import { useReorderMonitor, useReorderRow } from './reorder'

/** How far each level of nesting moves a row in, past the frame row's own 8 px. */
const INDENT = 14
const FRAME_INSET = 8

/** The reorder list a frame's children of one parent share, so a row drops only beside its siblings. */
function siblingList(frame: string, parent: number | null): string {
  return `elements\n${frame}\n${parent ?? ''}`
}

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
 * lists them too, each indented by depth, with the glyph `elementGlyph`
 * picks by text, media, and layout, a chevron on one with children, and a
 * click selecting the element. The selected row is tinted deeper than the rest of its
 * frame's band, as `layers/edit` and `inspector/text` draw them. A
 * double-click or F2 renames the element in place, writing `data-name`. A
 * row drags to another place among its siblings, never into another parent,
 * which stays a canvas drag.
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
  const canWrite = useLive((state) => state.canWrite)
  const [renaming, setRenaming] = useState<number | null>(null)
  const tree = entry?.status === 'ready' ? entry.tree : null
  const prefix = siblingList(frame.ref, null).slice(0, -1)
  const watches = useCallback(
    (list: string) => list.startsWith(prefix),
    [prefix],
  )
  const move = useCallback(
    (from: number, to: number, list: string) => {
      const element = tree?.elements.filter(
        (candidate) => siblingList(frame.ref, candidate.parent) === list,
      )[from]
      if (!tree || !element) return
      const key = { frame: frame.ref, index: element.index, hash: tree.hash }
      void moveElementTo(page, key, () => to)
    },
    [tree, frame.ref, page],
  )
  useReorderMonitor(watches, move)
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
  const rows = visibleRows(entry.tree.elements, isOpen)
  if (rows.length === 0) return <Notice depth={1}>No elements</Notice>
  const parents = new Set(entry.tree.elements.map((element) => element.parent))
  const places = siblingPlaces(entry.tree.elements)
  return (
    <ul aria-label={`Elements of ${frame.name}`}>
      {rows.map(({ element, depth }) => (
        <ElementRow
          key={element.index}
          page={page}
          element={element}
          elementKey={{
            frame: frame.ref,
            index: element.index,
            hash: entry.tree.hash,
          }}
          depth={depth}
          place={places.get(element.index) ?? 0}
          list={siblingList(frame.ref, element.parent)}
          open={isOpen(element.index)}
          holds={parents.has(element.index)}
          toggle={() => toggle(element.index)}
          tint={
            element.index === selected
              ? 'bg-primary/26'
              : frameSelected
                ? 'bg-primary/13'
                : selected !== null
                  ? 'bg-primary/7'
                  : 'hover:bg-accent'
          }
          isSelected={element.index === selected}
          canWrite={canWrite}
          renaming={renaming === element.index}
          setRenaming={(on) => setRenaming(on ? element.index : null)}
        />
      ))}
    </ul>
  )
}

interface ElementRowProps {
  page: string
  element: TreeElement
  elementKey: ElementKey
  depth: number
  /** Its place among its siblings, which a drop counts in. */
  place: number
  list: string
  open: boolean
  /** True when it holds elements, which gives it a chevron. */
  holds: boolean
  toggle: () => void
  tint: string
  isSelected: boolean
  canWrite: boolean
  renaming: boolean
  setRenaming: (on: boolean) => void
}

function ElementRow({
  page,
  element,
  elementKey: key,
  depth,
  place,
  list,
  open,
  holds,
  toggle,
  tint,
  isSelected,
  canWrite,
  renaming,
  setRenaming,
}: ElementRowProps) {
  const row = useRef<HTMLLIElement>(null)
  const edge = useReorderRow(row, {
    list,
    index: place,
    enabled: canWrite && !renaming,
  })
  const icon = <RowGlyph icon={elementGlyph(element)} selected={isSelected} />
  return (
    <ElementRowMenu
      page={page}
      element={key}
      trigger={
        <li
          ref={row}
          className={cn(
            'relative flex h-[26px] items-center gap-1.5 pr-2 text-foreground',
            tint,
          )}
          style={{ paddingLeft: FRAME_INSET + depth * INDENT }}
        >
          <DropLine edge={edge} />
          {holds ? (
            <button
              type="button"
              aria-label={`${open ? 'Hide' : 'Show'} what ${element.name} holds`}
              aria-expanded={open}
              onClick={toggle}
              className="-mr-1.5 -ml-[7px] grid size-6 shrink-0 place-items-center text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
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
          {renaming ? (
            <>
              {icon}
              <RenameField
                hug
                name={element.name}
                label={`Rename ${element.name}`}
                onCommit={(name) => {
                  setRenaming(false)
                  void writeElement(page, key, {
                    kind: 'attribute',
                    name: 'data-name',
                    value: name,
                  })
                }}
                onCancel={() => setRenaming(false)}
              />
            </>
          ) : (
            <button
              type="button"
              aria-current={isSelected ? 'true' : undefined}
              onClick={() => selectElement(selectionStore, page, key)}
              onDoubleClick={() => {
                if (canWrite) setRenaming(true)
              }}
              onKeyDown={(event) => {
                if (event.key !== 'F2' || !canWrite) return
                event.preventDefault()
                // The board's own F2 renames the selected frame, which this row's frame is.
                event.stopPropagation()
                setRenaming(true)
              }}
              className="flex min-w-0 flex-1 items-center gap-1.5 self-stretch text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
            >
              {icon}
              <span className="min-w-0 flex-1 truncate" title={element.name}>
                {element.name}
              </span>
            </button>
          )}
        </li>
      }
    />
  )
}

function RowGlyph({
  icon: Icon,
  selected,
}: {
  icon: LucideIcon
  selected: boolean
}) {
  return (
    <Icon
      aria-hidden
      className={cn(
        'size-[13px] shrink-0',
        selected ? 'text-primary' : 'text-muted-foreground',
      )}
    />
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
      className="flex h-[26px] items-center truncate pr-2 text-muted-foreground"
      style={{ paddingLeft: FRAME_INSET + depth * INDENT + 16 }}
    >
      {children}
    </p>
  )
}

/** Each element's place among the children of its parent, by index. */
function siblingPlaces(elements: readonly TreeElement[]): Map<number, number> {
  const counts = new Map<number | null, number>()
  const places = new Map<number, number>()
  for (const element of elements) {
    const place = counts.get(element.parent) ?? 0
    places.set(element.index, place)
    counts.set(element.parent, place + 1)
  }
  return places
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
