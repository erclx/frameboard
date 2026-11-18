import { Search } from 'lucide-react'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { useStore } from 'zustand'

import { Skeleton } from '@/client/components/ui/skeleton'
import { useLive } from '@/client/live/store'
import { BoardWriteError } from '@/client/live/write'

import {
  findImages,
  type ImageFind,
  saveKey,
  saveResult,
  saveStore,
} from '../sourcing'
import { ResultTile } from './result-tile'

const CODE = 'font-mono text-label font-normal text-foreground'
const LINE =
  'mx-3 my-1.5 text-label font-normal leading-[1.45] text-muted-foreground'
const FOOT =
  'mx-3 mt-1.5 mb-0.5 text-[10px] leading-[1.4] text-muted-foreground'
const LINK =
  'rounded-sm text-foreground underline underline-offset-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50'

/** How many grey tiles hold the grid's shape while a search runs. */
const PLACEHOLDERS = ['a', 'b', 'c', 'd']

type SearchState =
  | { state: 'idle' }
  | { state: 'searching'; query: string }
  | { state: 'done'; find: ImageFind }
  | { state: 'failed'; status: number | null; query: string }

interface FindViewProps {
  project: string
  /** Runs one search, the board's route in the app. */
  find?: typeof findImages
  /** Saves one result, shared with a drag of it, the board's route in the app. */
  save?: typeof saveResult
}

/**
 * Find in the Assets tab: an Openverse search for public domain images,
 * widened to credited licenses by a switch. A newer search abandons an older
 * one, so an older answer never replaces a newer.
 */
export function FindView({
  project,
  find = findImages,
  save = saveResult,
}: FindViewProps) {
  const canWrite = useLive((state) => state.canWrite)
  const [text, setText] = useState('')
  const [credited, setCredited] = useState(false)
  const [search, setSearch] = useState<SearchState>({ state: 'idle' })
  const running = useRef<AbortController | null>(null)
  useEffect(() => () => running.current?.abort(), [])

  async function run(query: string, wide: boolean) {
    const trimmed = query.trim()
    if (trimmed === '') return
    running.current?.abort()
    const controller = new AbortController()
    running.current = controller
    setSearch({ state: 'searching', query: trimmed })
    try {
      const answer = await find(project, trimmed, wide, controller.signal)
      if (!controller.signal.aborted) setSearch({ state: 'done', find: answer })
    } catch (error) {
      if (controller.signal.aborted) return
      const status =
        error instanceof BoardWriteError &&
        typeof error.details.status === 'number'
          ? error.details.status
          : null
      setSearch({ state: 'failed', status, query: trimmed })
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    void run(text, credited)
  }

  function widen(next: boolean) {
    setCredited(next)
    const last = lastQuery(search)
    if (last !== null) void run(last, next)
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
          aria-label="Search free images"
          placeholder="Search free images"
          value={text}
          spellCheck={false}
          onChange={(event) => setText(event.target.value)}
          className="min-w-0 flex-1 bg-transparent text-label font-normal outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
        />
      </form>
      <div
        role="group"
        aria-label="What to find"
        className="flex flex-wrap gap-1 px-2 pb-1.5"
      >
        <button
          type="button"
          aria-pressed
          className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-foreground px-2 text-[10px] text-background outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Images
        </button>
        <button
          type="button"
          aria-pressed={false}
          disabled
          aria-describedby="find-models-later"
          className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-muted px-2 text-[10px] text-muted-foreground disabled:opacity-60"
        >
          Models
        </button>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={credited}
        onClick={() => widen(!credited)}
        className="mx-1.5 flex min-h-6 items-center justify-between gap-2 rounded-md px-1.5 pb-1.5 text-label font-normal text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        Include credited licenses
        <span
          aria-hidden
          className={`relative h-[15px] w-[26px] shrink-0 rounded-full ${credited ? 'bg-primary' : 'bg-border'}`}
        >
          <span
            className={`absolute top-0.5 size-[11px] rounded-full bg-card ${credited ? 'left-[13px]' : 'left-0.5'}`}
          />
        </span>
      </button>
      <Body
        project={project}
        search={search}
        credited={credited}
        canWrite={canWrite}
        onWiden={() => widen(true)}
        onRetry={() => {
          const last = lastQuery(search)
          if (last !== null) void run(last, credited)
        }}
        onSave={(result, query) =>
          void save({ project, result, query, credited }).catch(() => undefined)
        }
      />
      <p id="find-models-later" className={FOOT}>
        3D models arrive in a later release.
      </p>
    </div>
  )
}

interface BodyProps {
  project: string
  search: SearchState
  credited: boolean
  canWrite: boolean
  onWiden: () => void
  onRetry: () => void
  onSave: (result: ImageFind['results'][number], query: string) => void
}

/** What sits under the controls, one block per state of the search. */
function Body({
  project,
  search,
  credited,
  canWrite,
  onWiden,
  onRetry,
  onSave,
}: BodyProps) {
  switch (search.state) {
    case 'idle':
      return (
        <>
          <p className={LINE}>
            Search public domain photos. A result you save lands in{' '}
            <code className={CODE}>assets/</code> with its license beside it.
          </p>
          <p className={FOOT}>Images from Openverse</p>
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
          <p className={FOOT}>Searching Openverse</p>
        </>
      )
    case 'failed':
      return (
        <p role="alert" className={`${LINE} text-destructive`}>
          {search.status === null
            ? 'Openverse did not answer. Check your connection, then '
            : `Openverse answered ${search.status}. Wait a moment, then `}
          <button type="button" onClick={onRetry} className={LINK}>
            search again
          </button>
          .
        </p>
      )
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
            <p className={FOOT}>Images from Openverse</p>
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
                onSave={() => onSave(result, query)}
              />
            ))}
          </ul>
          <SaveFailures project={project} results={results} />
          {canWrite ? null : (
            <p className={LINE}>
              This tab is read-only, so results cannot be saved. Run{' '}
              <code className={CODE}>frameboard open</code> for a tab that can.
            </p>
          )}
          {credited ? (
            <p className={LINE}>
              A credited image must be credited where you use it. The credit is
              saved in its license file.
            </p>
          ) : null}
          <p className={FOOT}>
            {results.length} {credited ? '' : 'public domain '}
            {results.length === 1 ? 'image' : 'images'} from Openverse
          </p>
        </>
      )
    }
  }
}

/** A line per result whose save failed, naming it and the reason. */
function SaveFailures({
  project,
  results,
}: {
  project: string
  results: ImageFind['results']
}) {
  const saves = useStore(saveStore)
  const failed = results.flatMap((result) => {
    const save = saves[saveKey(project, result.id)]
    return save?.state === 'failed'
      ? [
          {
            id: result.id,
            text: `${result.title ?? result.id}: ${save.message}`,
          },
        ]
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
  if (search.state === 'done') return search.find.query
  if (search.state === 'failed') return search.query
  return null
}
