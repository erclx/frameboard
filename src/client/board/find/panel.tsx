import { cn } from 'cn'
import { Frame, type LucideIcon, Search, Type, X } from 'lucide-react'
import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react'
import { useStore } from 'zustand'

import { useLive } from '@/client/live/store'
import type { TreeElement } from '@/shared/records/elements'
import type { FindHit } from '@/shared/records/find'

import { type Trees, trees as boardTrees } from '../element/tree'
import { BlockGlyph, elementGlyph } from '../left-panel/layer-glyphs'
import { closeFind, useFind } from './actions'
import { pickHit } from './pick'
import { type LoadFind, useFindAnswer } from './query'

type Filter = 'all' | FindHit['kind']

const FILTERS: readonly { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'frame', label: 'Frames' },
  { value: 'element', label: 'Elements' },
  { value: 'text', label: 'Text' },
]

/** What a hit draws with no tree row: the Frame `#` for a frame, else until its frame's tree at its hash arrives. */
const FALLBACK: Record<FindHit['kind'], LucideIcon> = {
  frame: Frame,
  element: BlockGlyph,
  text: Type,
}

const NOUNS: Record<FindHit['kind'], string> = {
  frame: 'frame',
  element: 'element',
  text: 'text',
}

interface FindPanelProps {
  project: string
  /** The name of the page on the canvas, whose group leads the results. */
  page: string
  /** What runs a search, the board's server when absent. */
  load?: LoadFind
  /** What a picked hit runs, the board's jump when absent. */
  pick?: (project: string, hit: FindHit) => void
  /** Where each hit's frame tree is read for its glyph, the board's cache when absent. */
  trees?: Trees
}

/**
 * The find panel of `canon/design/layers/find`, standing in for the left
 * panel's tabs: the field with its clear button, the kind filters, the hits
 * grouped by page with their counts and the match marked, and the way back.
 * The field owns Esc, since the registry skips keys typed in a field.
 */
export function FindPanel({
  project,
  page,
  load,
  pick = pickHit,
  trees = boardTrees,
}: FindPanelProps) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const field = useRef<HTMLInputElement>(null)
  const focusRequest = useFind((state) => state.focusRequest)
  const answer = useFindAnswer(project, query, page, load)
  const listId = useId()

  useEffect(() => {
    field.current?.focus()
    field.current?.select()
  }, [focusRequest])

  const hits =
    answer.status === 'ready'
      ? answer.result.hits.filter(
          (hit) => filter === 'all' || hit.kind === filter,
        )
      : []
  const groups = groupByPage(hits, answer.status === 'ready' ? answer.lead : '')
  const ordered = groups.flatMap((group) => group.hits)
  const active =
    ordered.find((hit) => hitKey(hit) === activeKey) ?? ordered[0] ?? null
  const optionId = (hit: FindHit) => `${listId}-${hitKey(hit)}`

  const run = (hit: FindHit) => {
    setActiveKey(hitKey(hit))
    pick(project, hit)
  }

  const onFieldKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (ordered.length === 0) return
      const at = active ? ordered.indexOf(active) : -1
      const step = event.key === 'ArrowDown' ? 1 : -1
      const next = ordered[(at + step + ordered.length) % ordered.length]
      if (next) setActiveKey(hitKey(next))
      return
    }
    if (event.key === 'Enter' && active) {
      event.preventDefault()
      run(active)
    }
  }

  const onPanelKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return
    // Kept from the window, where Esc would also clear the selection or leave Play.
    event.preventDefault()
    event.stopPropagation()
    closeFind()
  }

  const clearOrClose = () => {
    if (query === '') {
      closeFind()
      return
    }
    setQuery('')
    field.current?.focus()
  }

  return (
    <div
      className="flex min-h-0 flex-1 flex-col text-xs"
      onKeyDown={onPanelKey}
    >
      <div className="m-2 flex shrink-0 items-center gap-1.5">
        <label className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-[7px] bg-muted px-2 focus-within:ring-[1.5px] focus-within:ring-primary">
          <Search aria-hidden className="size-3.5 shrink-0" />
          <input
            ref={field}
            role="combobox"
            aria-label={`Find in ${project}`}
            aria-expanded={ordered.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={active ? optionId(active) : undefined}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onFieldKey}
            spellCheck={false}
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent text-xs text-foreground outline-none"
          />
        </label>
        <button
          type="button"
          aria-label={query === '' ? 'Close find' : 'Clear the search'}
          onClick={clearOrClose}
          className="grid size-[26px] shrink-0 place-items-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-accent"
        >
          <X aria-hidden className="size-3.5" />
        </button>
      </div>
      <div
        role="group"
        aria-label="Show"
        className="flex shrink-0 gap-1 px-2 pb-1.5"
      >
        {FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={filter === option.value}
            onClick={() => setFilter(option.value)}
            className={cn(
              'flex h-[22px] items-center rounded-full px-2 text-[11px] outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
              filter === option.value
                ? 'bg-foreground text-sidebar'
                : 'bg-muted text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div
        id={listId}
        role="listbox"
        aria-label="Matches"
        aria-busy={answer.status === 'ready' && answer.updating}
        className={cn(
          // Shrinks to its rows, so the status and the hint sit under the last one.
          'min-h-0 overflow-y-auto pb-1',
          answer.status === 'ready' && answer.updating && 'opacity-60',
        )}
      >
        {groups.map((group) => (
          <div
            key={group.page}
            role="group"
            aria-labelledby={`${listId}-${group.page}`}
          >
            <div className="flex justify-between px-3 pt-2 pb-0.5 text-[11px] font-semibold text-muted-foreground">
              <span id={`${listId}-${group.page}`}>{group.page}</span>
              <span>{group.hits.length}</span>
            </div>
            {group.hits.map((hit) => (
              <HitRow
                key={hitKey(hit)}
                id={optionId(hit)}
                hit={hit}
                query={query}
                active={hit === active}
                onPick={() => run(hit)}
                trees={trees}
              />
            ))}
          </div>
        ))}
      </div>
      <Status
        answer={answer}
        project={project}
        shown={ordered.length}
        filter={filter}
        onShowAll={() => setFilter('all')}
      />
      <p className="shrink-0 px-3 pt-2 pb-3 text-[11px] text-muted-foreground">
        Esc goes back to the layers
      </p>
    </div>
  )
}

interface HitRowProps {
  id: string
  hit: FindHit
  query: string
  active: boolean
  onPick: () => void
  trees: Trees
}

function HitRow({ id, hit, query, active, onPick, trees }: HitRowProps) {
  const row = useHitRow(hit, trees)
  const title =
    hit.kind === 'text' ? (
      `Text in ${hit.frame}`
    ) : (
      <Marked text={hit.name} query={query} />
    )
  const detail =
    hit.kind === 'text' ? (
      <>
        “<Marked text={hit.snippet ?? ''} query={query} />”
      </>
    ) : hit.kind === 'element' ? (
      `in ${hit.frame}`
    ) : (
      NOUNS.frame
    )
  return (
    <div
      id={id}
      role="option"
      aria-selected={active}
      // Keeps focus in the field, so the arrows and Esc still reach it.
      onMouseDown={(event) => event.preventDefault()}
      onClick={onPick}
      className={cn(
        'mx-1.5 flex items-start gap-2 rounded-md px-2 py-[5px] text-foreground hover:bg-sidebar-accent',
        active && 'bg-accent',
      )}
    >
      <HitGlyph icon={row ? elementGlyph(row) : FALLBACK[hit.kind]} />
      <div className="min-w-0 flex-1">
        <div className="truncate">{title}</div>
        <div className="truncate text-[11px] text-muted-foreground">
          {detail}
        </div>
      </div>
    </div>
  )
}

function HitGlyph({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <Icon
      aria-hidden
      className="mt-px size-[13px] shrink-0 text-muted-foreground"
    />
  )
}

/**
 * The Layers row of an element hit, from its frame's tree read at the hash
 * the hit was found at, since another hash's index may name another element.
 * Null for a frame hit, and until a tree at that hash arrives.
 */
function useHitRow(hit: FindHit, trees: Trees): TreeElement | null {
  const ref = hit.kind === 'frame' ? null : hit.ref
  const version = useLive((state) => (ref ? (state.reloads[ref] ?? 0) : 0))
  useEffect(() => {
    if (ref) trees.request(ref, version)
  }, [ref, version, trees])
  const entry = useStore(trees.store, (state) =>
    ref ? state.byRef[ref] : undefined,
  )
  if (entry?.status !== 'ready' || entry.tree.hash !== hit.hash) return null
  return entry.tree.elements.find(({ index }) => index === hit.index) ?? null
}

interface StatusProps {
  answer: ReturnType<typeof useFindAnswer>
  project: string
  shown: number
  filter: Filter
  onShowAll: () => void
}

/** The line under the hits saying why there are none, or that they were cut. */
function Status({ answer, project, shown, filter, onShowAll }: StatusProps) {
  const line = 'shrink-0 px-3 pt-2 text-[11px]'
  if (answer.status === 'idle') {
    return (
      <p className={cn(line, 'text-muted-foreground')}>
        Type to find frames, elements, and text across every page of {project}.
      </p>
    )
  }
  if (answer.status === 'loading') return null
  if (answer.status === 'refused') {
    return (
      <p role="alert" className={cn(line, 'text-destructive')}>
        {answer.message}
      </p>
    )
  }
  const { hits, truncated, query } = answer.result
  if (hits.length === 0) {
    return (
      <p className={cn(line, 'text-muted-foreground')}>
        Nothing in {project} matches “{query.trim()}”.
      </p>
    )
  }
  if (shown === 0 && filter !== 'all') {
    return (
      <p className={cn(line, 'text-muted-foreground')}>
        {truncated
          ? `The first ${hits.length} matches hold no ${NOUNS[filter]}. Type more to narrow them.`
          : `No ${NOUNS[filter]} matches.`}{' '}
        <button
          type="button"
          onClick={onShowAll}
          className="text-foreground underline underline-offset-2 outline-none hover:text-primary focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Show all
        </button>
      </p>
    )
  }
  if (truncated) {
    return (
      <p className={cn(line, 'text-muted-foreground')}>
        Showing the first {hits.length} matches. Type more to narrow them.
      </p>
    )
  }
  return null
}

/** The text with the query's first case-insensitive match marked. */
function Marked({ text, query }: { text: string; query: string }) {
  const needle = query.trim().toLowerCase()
  const at = needle === '' ? -1 : text.toLowerCase().indexOf(needle)
  if (at === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, at)}
      <mark className="rounded-[2px] bg-primary/35 text-foreground">
        {text.slice(at, at + needle.length)}
      </mark>
      {text.slice(at + needle.length)}
    </>
  )
}

interface PageGroup {
  page: string
  hits: FindHit[]
}

/** Hits by page in the order the server sent them, with `lead`'s page first. */
function groupByPage(hits: readonly FindHit[], lead: string): PageGroup[] {
  const groups: PageGroup[] = []
  for (const hit of hits) {
    const group = groups.find((candidate) => candidate.page === hit.page)
    if (group) group.hits.push(hit)
    else groups.push({ page: hit.page, hits: [hit] })
  }
  const leading = groups.findIndex((group) => group.page === lead)
  if (leading > 0) groups.unshift(...groups.splice(leading, 1))
  return groups
}

function hitKey(hit: FindHit): string {
  return `${hit.kind}:${hit.ref}:${hit.index ?? ''}`
}
