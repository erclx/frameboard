import { ChevronDown, Search } from 'lucide-react'
import type { FormEvent } from 'react'
import { useStore } from 'zustand'

import { ChromeMenuContent, MENU_ROW } from '@/client/board/chrome/menu'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/client/components/ui/dropdown-menu'
import { Skeleton } from '@/client/components/ui/skeleton'
import { useLive } from '@/client/live/store'
import { BoardWriteError } from '@/client/live/write'

import {
  findImages,
  findModels,
  type ResultKind,
  saveKey,
  saveResult,
  saveStore,
} from '../sourcing'
import { ModelTile, ResultTile } from './result-tile'
import {
  EMPTY_SEARCH,
  type FindSearch,
  type Kind,
  nextSearch,
  type SearchState,
  searchStore,
  stopSearch,
  updateSearch,
} from './search-store'

const CODE = 'font-mono text-label font-normal text-foreground'
const LINE_BOX = 'mx-3 my-1.5 text-label font-normal leading-[1.45]'
const LINE = `${LINE_BOX} text-muted-foreground`
const ALERT = `${LINE_BOX} text-destructive`
const FOOT =
  'mx-3 mt-1.5 mb-0.5 text-[10px] leading-[1.4] text-muted-foreground'
const LINK =
  'rounded-sm text-foreground underline underline-offset-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50'

/** How many grey tiles hold the grid's shape while a search runs. */
const PLACEHOLDERS = ['a', 'b', 'c', 'd']

const KIND: Record<
  Kind,
  { label: string; source: string; field: string; result: ResultKind }
> = {
  images: {
    label: 'Images',
    source: 'Openverse',
    field: 'Search free images',
    result: 'image',
  },
  models: {
    label: 'Models',
    source: 'Poly Haven',
    field: 'Search free models',
    result: 'model',
  },
}

interface FindViewProps {
  project: string
  /** Runs one image search, the board's route in the app. */
  find?: typeof findImages
  /** Runs one model search, the board's route in the app. */
  findModels?: typeof findModels
  /** Saves one result, shared with a drag of it, the board's route in the app. */
  save?: typeof saveResult
}

/**
 * Find in the Assets tab, searching Openverse's images or Poly Haven's CC0
 * models. The search lives in the project's store entry, so it outlives the tab and keeps landing after the tab closes.
 */
export function FindView({
  project,
  find = findImages,
  findModels: findModel = findModels,
  save = saveResult,
}: FindViewProps) {
  const canWrite = useLive((state) => state.canWrite)
  const { text, kind, credited, search } = useStore(
    searchStore,
    (state) => state[project] ?? EMPTY_SEARCH,
  )
  const update = (change: Partial<FindSearch>) => updateSearch(project, change)

  async function run(query: string, wide: boolean, on: Kind) {
    const trimmed = query.trim()
    if (trimmed === '') return
    const signal = nextSearch(project)
    update({ search: { state: 'searching', query: trimmed } })
    try {
      const next: SearchState =
        on === 'models'
          ? {
              state: 'models',
              find: await findModel(project, trimmed, signal),
            }
          : {
              state: 'done',
              find: await find(project, trimmed, wide, signal),
            }
      if (!signal.aborted) update({ search: next })
    } catch (error) {
      if (signal.aborted) return
      const status =
        error instanceof BoardWriteError &&
        typeof error.details.status === 'number'
          ? error.details.status
          : null
      update({ search: { state: 'failed', status, query: trimmed } })
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    void run(text, credited, kind)
  }

  function widen(next: boolean) {
    update({ credited: next })
    const last = lastQuery(search)
    if (last !== null) void run(last, next, kind)
  }

  function pick(next: Kind) {
    if (next === kind) return
    update({ kind: next })
    const typed = text.trim() === '' ? lastQuery(search) : text
    if (typed === null) {
      stopSearch(project)
      update({ search: { state: 'idle' } })
      return
    }
    void run(typed, credited, next)
  }

  return (
    <div
      aria-busy={search.state === 'searching'}
      className="flex h-full flex-col overflow-y-auto pb-2"
    >
      <form
        role="search"
        onSubmit={submit}
        className="mx-2 mt-1 mb-1.5 flex h-[26px] shrink-0 items-center gap-1.5 rounded-md bg-muted px-2 focus-within:ring-[1.5px] focus-within:ring-primary"
      >
        <Search
          aria-hidden
          className="size-[13px] shrink-0 text-muted-foreground"
        />
        <input
          type="search"
          aria-label={KIND[kind].field}
          placeholder={KIND[kind].field}
          value={text}
          spellCheck={false}
          onChange={(event) => update({ text: event.target.value })}
          className="min-w-0 flex-1 bg-transparent text-label font-normal outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
        />
        <FilterMenu
          kind={kind}
          onKind={pick}
          credited={credited}
          onCredited={widen}
        />
      </form>
      <Body
        project={project}
        kind={kind}
        search={search}
        credited={credited}
        canWrite={canWrite}
        onWiden={() => widen(true)}
        onRetry={() => {
          const last = lastQuery(search)
          if (last !== null) void run(last, credited, kind)
        }}
        onSave={(id, query, result) =>
          void save({
            project,
            result: { id },
            query,
            credited: result === 'model' ? false : credited,
            kind: result,
          }).catch(() => undefined)
        }
      />
    </div>
  )
}

/**
 * The kind and the license choice in one control at the field's end. The
 * license choice greys out under Models rather than leaving, so the rows hold still.
 */
function FilterMenu({
  kind,
  onKind,
  credited,
  onCredited,
}: {
  kind: Kind
  onKind: (next: Kind) => void
  credited: boolean
  onCredited: (next: boolean) => void
}) {
  const models = kind === 'models'
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Filter: ${KIND[kind].label}`}
        className="-mr-1 flex h-5 shrink-0 items-center gap-0.5 rounded-[5px] px-1 text-label font-normal text-foreground outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {KIND[kind].label}
        <ChevronDown aria-hidden className="size-2.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <ChromeMenuContent align="end" sideOffset={6} className="w-[200px]">
        <DropdownMenuRadioGroup
          value={kind}
          onValueChange={(next: Kind) => onKind(next)}
        >
          <DropdownMenuRadioItem value="images" className={MENU_ROW}>
            Images
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="models" className={MENU_ROW}>
            Models
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={!models && credited}
          disabled={models}
          aria-describedby={models ? 'find-models-cc0' : undefined}
          onCheckedChange={onCredited}
          className={MENU_ROW}
        >
          Include credited licenses
        </DropdownMenuCheckboxItem>
        {models ? (
          <p
            id="find-models-cc0"
            className="px-2 pb-1 text-[10px] leading-[1.4] text-muted-foreground"
          >
            Every Poly Haven model is CC0.
          </p>
        ) : null}
      </ChromeMenuContent>
    </DropdownMenu>
  )
}

interface BodyProps {
  project: string
  kind: Kind
  search: SearchState
  credited: boolean
  canWrite: boolean
  onWiden: () => void
  onRetry: () => void
  onSave: (id: string, query: string, kind: ResultKind) => void
}

/** What sits under the controls, one block per state of the search. */
function Body({
  project,
  kind,
  search,
  credited,
  canWrite,
  onWiden,
  onRetry,
  onSave,
}: BodyProps) {
  const { source } = KIND[kind]
  const sourceLine = (
    <p className={FOOT}>
      {kind === 'models' ? 'Models' : 'Images'} from {source}
    </p>
  )
  const readOnly = canWrite ? null : (
    <p className={LINE}>
      This tab is read-only, so results cannot be saved. Run{' '}
      <code className={CODE}>frameboard open</code> for a tab that can.
    </p>
  )
  switch (search.state) {
    case 'idle':
      return (
        <>
          <p className={LINE}>
            {kind === 'models'
              ? 'Search public domain 3D models.'
              : 'Search public domain photos.'}{' '}
            A result you save lands in <code className={CODE}>assets/</code>{' '}
            with its license beside it.
          </p>
          {sourceLine}
        </>
      )
    case 'searching':
      return (
        <>
          <ul
            aria-label="Searching"
            className="grid grid-cols-2 gap-2 px-2 py-1"
          >
            {PLACEHOLDERS.map((id) => (
              <li key={id} className="overflow-hidden rounded-lg bg-muted">
                <span className="block h-[72px]" />
                <span className="block h-[38px] px-[7px] py-[5px]">
                  <Skeleton className="my-[3px] h-2 w-[70%] rounded-[3px] bg-foreground/10" />
                  <Skeleton className="my-[3px] h-2 w-[45%] rounded-[3px] bg-foreground/10" />
                </span>
              </li>
            ))}
          </ul>
          <p className={FOOT}>Searching {source}</p>
        </>
      )
    case 'failed':
      return (
        <>
          <p role="alert" className={ALERT}>
            {search.status === null
              ? `${source} did not answer. Check your connection, then `
              : `${source} answered ${search.status}. Wait a moment, then `}
            <button type="button" onClick={onRetry} className={LINK}>
              search again
            </button>
            .
          </p>
          {sourceLine}
        </>
      )
    case 'models': {
      const { results, query } = search.find
      if (results.length === 0) {
        return (
          <>
            <p className={LINE}>
              <b className="font-semibold text-foreground">No models found.</b>
              <br />
              Try fewer words.
            </p>
            {sourceLine}
          </>
        )
      }
      return (
        <>
          <ul aria-label="Results" className="grid grid-cols-2 gap-2 px-2 py-1">
            {results.map((result) => (
              <ModelTile
                key={result.id}
                project={project}
                result={result}
                query={query}
                onSave={() => onSave(result.id, query, 'model')}
              />
            ))}
          </ul>
          <SaveFailures
            project={project}
            kind="model"
            results={results.map(({ id, name }) => ({ id, label: name }))}
          />
          {readOnly}
          <p className={FOOT}>
            {results.length} {results.length === 1 ? 'model' : 'models'} from{' '}
            {source}
          </p>
        </>
      )
    }
    case 'done': {
      const { results, query } = search.find
      if (results.length === 0) {
        return (
          <>
            <p className={LINE}>
              <b className="font-semibold text-foreground">
                {credited
                  ? 'No images found.'
                  : 'No public domain images found.'}
              </b>
              <br />
              {credited ? (
                'Try fewer words.'
              ) : (
                <>
                  Try fewer words, or{' '}
                  <button type="button" onClick={onWiden} className={LINK}>
                    include credited licenses
                  </button>
                  .
                </>
              )}
            </p>
            {sourceLine}
          </>
        )
      }
      return (
        <>
          <ul aria-label="Results" className="grid grid-cols-2 gap-2 px-2 py-1">
            {results.map((result) => (
              <ResultTile
                key={result.id}
                project={project}
                result={result}
                query={query}
                credited={credited}
                onSave={() => onSave(result.id, query, 'image')}
              />
            ))}
          </ul>
          <SaveFailures
            project={project}
            kind="image"
            results={results.map(({ id, title }) => ({
              id,
              label: title ?? id,
            }))}
          />
          {readOnly}
          {credited ? (
            <p className={LINE}>
              A credited image must be credited where you use it. The credit is
              saved in its license file.
            </p>
          ) : null}
          <p className={FOOT}>
            {results.length} {credited ? '' : 'public domain '}
            {results.length === 1 ? 'image' : 'images'} from {source}
          </p>
        </>
      )
    }
  }
}

/** A line per result whose save failed, naming it and the reason. */
function SaveFailures({
  project,
  kind,
  results,
}: {
  project: string
  kind: ResultKind
  results: { id: string; label: string }[]
}) {
  const saves = useStore(saveStore)
  const failed = results.flatMap((result) => {
    const save = saves[saveKey(project, result.id, kind)]
    return save?.state === 'failed'
      ? [{ id: result.id, text: `${result.label}: ${save.message}` }]
      : []
  })
  if (failed.length === 0) return null
  return (
    <ul role="alert" className="mx-3 text-label font-normal text-destructive">
      {failed.map((entry) => (
        <li key={entry.id} className="leading-[1.45]">
          {entry.text}
        </li>
      ))}
    </ul>
  )
}

function lastQuery(search: SearchState): string | null {
  if (search.state === 'searching') return search.query
  if (search.state === 'done' || search.state === 'models') {
    return search.find.query
  }
  if (search.state === 'failed') return search.query
  return null
}
