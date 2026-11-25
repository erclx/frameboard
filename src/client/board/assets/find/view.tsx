import { ChevronDown, Search } from 'lucide-react'
import type { FormEvent, ReactNode } from 'react'
import { useStore } from 'zustand'

import { ChromeMenuContent, MENU_ROW } from '@/client/board/chrome/menu'
import {
  DropdownMenu,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/client/components/ui/dropdown-menu'
import { BoardWriteError } from '@/client/live/write'
import { assetKind, isPlaceableKind } from '@/shared/asset-kinds'

import type { PlaceableFile } from '../drag'
import { Preview, PreviewSkeleton } from '../preview'
import { PendingTile, RESULT_GRID, ResultTile } from '../result-tile'
import {
  findImages,
  findModels,
  type ImageResult,
  type ModelResult,
  type ResultKind,
  saveKey,
  type SaveRequest,
  saveResult,
  saveStore,
} from '../sourcing'
import { ImagePicture, ModelPicture } from './picture'
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
const LINE_BOX = 'text-label font-normal leading-[1.45]'
const LINE = `${LINE_BOX} text-muted-foreground`
const ALERT = `${LINE_BOX} text-destructive`
const FOOT = 'mt-2.5 text-caption leading-[1.4] text-muted-foreground'
const LINK =
  'rounded-sm text-foreground underline underline-offset-2 outline-none focus-visible:ring-3 focus-visible:ring-ring'

/** How many grey tiles hold the grid's shape while a search runs. */
const PLACEHOLDERS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']

const KIND: Record<Kind, { label: string; source: string; field: string }> = {
  images: {
    label: 'Images',
    source: 'Openverse',
    field: 'Search free images',
  },
  models: {
    label: 'Models',
    source: 'Poly Haven',
    field: 'Search free models',
  },
}

interface FindViewProps {
  project: string
  /** Runs one image search, the board's route in the app. */
  find?: typeof findImages
  /** Runs one model search, the board's route in the app. */
  findModels?: typeof findModels
  /** Saves one result, the board's route in the app. */
  save?: typeof saveResult
}

/**
 * Find in the dialog, searching Openverse's images or Poly Haven's CC0 models
 * into a grid beside the picked result's preview. The search lives in the
 * project's store entry, so it outlives the dialog and lands after it closes.
 */
export function FindView({
  project,
  find = findImages,
  findModels: findModel = findModels,
  save = saveResult,
}: FindViewProps) {
  const { text, kind, credited, search, picked } = useStore(
    searchStore,
    (state) => state[project] ?? EMPTY_SEARCH,
  )
  const update = (change: Partial<FindSearch>) => updateSearch(project, change)

  async function run(query: string, wide: boolean, on: Kind) {
    const trimmed = query.trim()
    if (trimmed === '') return
    const signal = nextSearch(project)
    update({ search: { state: 'searching', query: trimmed }, picked: null })
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
      if (signal.aborted) return
      update({ search: next, picked: next.find.results[0]?.id ?? null })
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
    if (next === credited) return
    update({ credited: next })
    const last = lastQuery(search)
    if (last !== null) void run(last, next, kind)
  }

  function pickKind(next: Kind) {
    if (next === kind) return
    update({ kind: next })
    const typed = text.trim() === '' ? lastQuery(search) : text
    if (typed === null) {
      stopSearch(project)
      update({ search: { state: 'idle' }, picked: null })
      return
    }
    void run(typed, credited, next)
  }

  const found = foundOf(search)
  const shown = found.find((item) => item.id === picked)
  const saves = useStore(saveStore)
  const saveOf = (item: Found) => saves[saveKey(project, item.id, item.kind)]
  const requestOf = (item: Found): SaveRequest => ({
    project,
    result: { id: item.id },
    query: lastQuery(search) ?? '',
    credited: item.kind === 'model' ? false : credited,
    kind: item.kind,
  })

  return (
    <div
      aria-busy={search.state === 'searching'}
      className="@container flex min-h-0 flex-1 flex-col"
    >
      <form
        role="search"
        onSubmit={submit}
        className="flex shrink-0 flex-wrap gap-2 border-b border-border px-4 py-3"
      >
        <div className="flex h-[26px] min-w-48 flex-1 items-center gap-1.5 rounded-md bg-input px-2 focus-within:ring-[1.5px] focus-within:ring-primary">
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
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
          />
        </div>
        <KindMenu kind={kind} onKind={pickKind} />
        <LicenseMenu
          models={kind === 'models'}
          credited={credited}
          onCredited={widen}
        />
      </form>
      <div className="flex min-h-0 flex-1 flex-col @min-[640px]:flex-row">
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-3">
          <Body
            kind={kind}
            search={search}
            credited={credited}
            onWiden={() => widen(true)}
            onRetry={() => {
              const last = lastQuery(search)
              if (last !== null) void run(last, credited, kind)
            }}
          >
            <ul aria-label="Results" className={RESULT_GRID}>
              {found.map((item) => (
                <ResultTile
                  key={item.id}
                  picture={item.picture('cover')}
                  title={item.title}
                  meta={item.meta}
                  picked={item.id === picked}
                  save={saveOf(item)}
                  onPick={() => update({ picked: item.id })}
                />
              ))}
            </ul>
          </Body>
        </div>
        {search.state === 'searching' ? <PreviewSkeleton /> : null}
        {shown ? (
          <Preview
            key={`${shown.kind} ${shown.id}`}
            project={project}
            id={saveKey(project, shown.id, shown.kind)}
            picture={shown.picture('contain')}
            title={shown.title}
            lines={[`${shown.meta} · ${KIND[kind].source}`]}
            save={{
              state: saveOf(shown),
              // A refusal shows from the save's own state.
              run: () => void save(requestOf(shown)).catch(() => undefined),
            }}
            file={async () =>
              placeable(project, (await save(requestOf(shown))).path)
            }
            primary
          />
        ) : null}
      </div>
    </div>
  )
}

/** A found image or model as the grid and the preview draw it. */
interface Found {
  id: string
  kind: ResultKind
  title: string
  /** Its size and license, the size left out where the source reports none. */
  meta: string
  picture: (fit: 'cover' | 'contain') => ReactNode
}

function foundOf(search: SearchState): Found[] {
  if (search.state === 'done') return search.find.results.map(foundImage)
  if (search.state === 'models') return search.find.results.map(foundModel)
  return []
}

function foundImage(result: ImageResult): Found {
  return {
    id: result.id,
    kind: 'image',
    title: result.title?.trim() || 'Untitled image',
    meta: metaLine(sizeOf(result), result.license),
    picture: (fit) => <ImagePicture result={result} fit={fit} />,
  }
}

function foundModel(result: ModelResult): Found {
  return {
    id: result.id,
    kind: 'model',
    title: result.name,
    meta: metaLine(trianglesOf(result.polycount), result.license),
    picture: (fit) => <ModelPicture result={result} fit={fit} />,
  }
}

function metaLine(size: string | null, license: string): string {
  return [size, license.toUpperCase()].filter(Boolean).join(' · ')
}

function sizeOf({
  width,
  height,
}: Pick<ImageResult, 'width' | 'height'>): string | null {
  return width === null || height === null ? null : `${width} × ${height}`
}

/** A polycount as a short count of triangles, such as `2.7k tris`, null when Poly Haven gives none. */
function trianglesOf(polycount: number | null): string | null {
  if (polycount === null) return null
  if (polycount < 1000) return `${polycount} tris`
  const thousands = polycount / 1000
  const shown =
    thousands < 10
      ? String(Math.round(thousands * 10) / 10)
      : String(Math.round(thousands))
  return `${shown}k tris`
}

/** A saved file as a placement takes it, refusing one no frame shows. */
function placeable(project: string, path: string): PlaceableFile {
  const kind = assetKind(path)
  if (!isPlaceableKind(kind)) {
    throw new Error(`assets/${path} is saved, but a frame cannot show it.`)
  }
  return { project, path, kind }
}

const MENU_TRIGGER =
  'flex h-[26px] shrink-0 items-center gap-1 rounded-md bg-input px-2 outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring'

/** Whether Find searches images or models. */
function KindMenu({
  kind,
  onKind,
}: {
  kind: Kind
  onKind: (next: Kind) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Kind: ${KIND[kind].label}`}
        className={MENU_TRIGGER}
      >
        {KIND[kind].label}
        <ChevronDown aria-hidden className="size-2.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <ChromeMenuContent align="end" sideOffset={6} className="w-[160px]">
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
      </ChromeMenuContent>
    </DropdownMenu>
  )
}

const FREE = 'Free licenses only'
const CREDITED = 'Include credited licenses'

/**
 * Whether a search takes licenses owing a credit. The choice greys out under
 * Models with its reason rather than leaving, so the row holds still.
 */
function LicenseMenu({
  models,
  credited,
  onCredited,
}: {
  models: boolean
  credited: boolean
  onCredited: (next: boolean) => void
}) {
  const wide = credited && !models
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Licenses: ${wide ? CREDITED : FREE}`}
        className={MENU_TRIGGER}
      >
        {wide ? CREDITED : FREE}
        <ChevronDown aria-hidden className="size-2.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <ChromeMenuContent align="end" sideOffset={6} className="w-[220px]">
        <DropdownMenuRadioGroup
          value={wide ? 'credited' : 'free'}
          onValueChange={(next: string) => onCredited(next === 'credited')}
        >
          <DropdownMenuRadioItem value="free" className={MENU_ROW}>
            {FREE}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem
            value="credited"
            disabled={models}
            aria-describedby={models ? 'find-models-cc0' : undefined}
            className={MENU_ROW}
          >
            {CREDITED}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        {models ? (
          <p
            id="find-models-cc0"
            className="px-2 pb-1 text-caption leading-[1.4] text-muted-foreground"
          >
            Every Poly Haven model is CC0.
          </p>
        ) : null}
      </ChromeMenuContent>
    </DropdownMenu>
  )
}

interface BodyProps {
  kind: Kind
  search: SearchState
  credited: boolean
  onWiden: () => void
  onRetry: () => void
  /** The results grid, drawn once a search found some. */
  children: ReactNode
}

/** What sits under the controls, one block per state of the search. */
function Body({
  kind,
  search,
  credited,
  onWiden,
  onRetry,
  children,
}: BodyProps) {
  const { source } = KIND[kind]
  const sourceLine = (
    <p className={FOOT}>
      {kind === 'models' ? 'Models' : 'Images'} from {source}
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
          <ul aria-label="Searching" className={RESULT_GRID}>
            {PLACEHOLDERS.map((id) => (
              <PendingTile key={id} />
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
      const count = search.find.results.length
      if (count === 0) {
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
          {children}
          <p className={FOOT}>
            {count} {count === 1 ? 'model' : 'models'} from {source}
          </p>
        </>
      )
    }
    case 'done': {
      const count = search.find.results.length
      if (count === 0) {
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
          {children}
          <p className={FOOT}>
            {count} {credited ? '' : 'public domain '}
            {count === 1 ? 'image' : 'images'} from {source}
            {credited
              ? '. A credited image must be credited where you use it. The credit is saved in its license file.'
              : ''}
          </p>
        </>
      )
    }
  }
}

function lastQuery(search: SearchState): string | null {
  if (search.state === 'searching') return search.query
  if (search.state === 'done' || search.state === 'models') {
    return search.find.query
  }
  if (search.state === 'failed') return search.query
  return null
}
