import { Plus, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/client/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/client/components/ui/dialog'
import { useLive } from '@/client/live/store'
import { BoardWriteError } from '@/client/live/write'
import { FACES, faceSheetUrl, faceStack } from '@/shared/faces'
import { FONT_SHEET } from '@/shared/fonts'
import type { ListResult } from '@/shared/records/list'
import type {
  FontFind,
  FontList,
  FontResult,
  InstalledFont,
} from '@/shared/records/sourcing'

import {
  fetchInstalledFonts,
  findFonts,
  useInstalledFonts,
} from '../../assets/sourcing'
import { installFont, removeFont } from './write'

/** How many frame names the removal confirmation spells out before counting the rest. */
const NAMED_FRAMES = 5

interface FontsSectionProps {
  project: string
  /** Reads the project's installed fonts, the API in the app. */
  load?: (project: string) => Promise<FontList | null>
  find?: typeof findFonts
  install?: typeof installFont
  remove?: typeof removeFont
}

/** How long typing rests before the search runs, so each keystroke sends no request. */
const SEARCH_REST_MS = 250

/** One family a frame may name, built in or installed. */
interface FamilyRow {
  family: string
  /** The stack the row's name is set in. */
  stack: string
  /** Where it came from, as `Built in` or a license such as `OFL`. */
  source: string
  installed: InstalledFont | null
}

/**
 * Every family the project's frames may name, the board's own faces then the
 * ones it installed, each set in its own face. An installed family the board
 * also serves lists once, as installed, since that row is the one removal
 * acts on.
 */
export function FontsSection({
  project,
  load = fetchInstalledFonts,
  find = findFonts,
  install = installFont,
  remove = removeFont,
}: FontsSectionProps) {
  const canWrite = useLive((state) => state.canWrite)
  const board = useLive((state) => state.board)
  const list = useInstalledFonts(project, load)
  const installed = list?.fonts ?? []
  const [confirming, setConfirming] = useState<InstalledFont | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  const rows = familyRows(installed)

  const run = async (font: InstalledFont) => {
    setRemoving(font.id)
    setProblem(null)
    try {
      await remove(project, font.id)
    } catch (error) {
      setProblem(
        `Couldn’t remove ${font.family}. ${error instanceof Error ? error.message : String(error)}`,
      )
    } finally {
      setRemoving(null)
    }
  }

  return (
    <section
      aria-labelledby="theme-fonts"
      className="border-b border-sidebar-border px-3 pt-1 pb-2.5"
    >
      {FACES.map((face) => (
        <link key={face.folder} rel="stylesheet" href={faceSheetUrl(face)} />
      ))}
      {installed.length > 0 ? (
        <link rel="stylesheet" href={projectSheet(project, installed)} />
      ) : null}
      <div className="flex h-6 items-center justify-between gap-2">
        <h3 id="theme-fonts" className="text-xs font-semibold">
          Fonts
        </h3>
        <span className="text-label text-muted-foreground">
          {installed.length > 0 ? `${installed.length} installed` : null}
        </span>
      </div>
      {list === null ? (
        <p className="pb-1 leading-[1.45] text-muted-foreground">
          The installed fonts did not load. Reload the board to try again.
        </p>
      ) : null}
      <ul
        aria-label="Fonts frames can use"
        className="-mx-1 max-h-64 overflow-y-auto px-1"
      >
        {rows.map((row) => (
          <li
            key={row.family}
            className="group flex min-h-8 items-center gap-2"
          >
            <span
              className="min-w-0 flex-1 truncate text-[15px] leading-tight group-focus-within:whitespace-normal"
              style={{ fontFamily: row.stack }}
            >
              {row.family}
            </span>
            <span className="shrink-0 text-label text-muted-foreground">
              {row.source}
            </span>
            {row.installed && canWrite ? (
              <RemoveButton
                font={row.installed}
                busy={removing === row.installed.id}
                onRemove={(font) =>
                  warnsOn(font).length > 0
                    ? setConfirming(font)
                    : void run(font)
                }
              />
            ) : null}
          </li>
        ))}
      </ul>
      {problem ? (
        <p role="alert" className="pt-1 leading-[1.45] text-destructive">
          {problem}
        </p>
      ) : null}
      {canWrite ? (
        <FindFont
          project={project}
          installed={installed}
          find={find}
          install={install}
        />
      ) : (
        <p className="pt-1 leading-[1.45] text-muted-foreground">
          View only, so fonts can’t be added or removed here.
        </p>
      )}
      <Dialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open) setConfirming(null)
        }}
      >
        <DialogContent showCloseButton={false} className="gap-3 p-4">
          <DialogTitle className="text-title font-semibold">
            Remove {confirming?.family}?
          </DialogTitle>
          <DialogDescription>
            {confirming ? fallingBack(warnsOn(confirming), board) : null} Undo
            brings the font back.
          </DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (confirming) void run(confirming)
                setConfirming(null)
              }}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}

type Search =
  | { state: 'idle' }
  | { state: 'searching' }
  | { state: 'found'; find: FontFind }
  | { state: 'failed'; message: string }

interface FindFontProps {
  project: string
  installed: readonly InstalledFont[]
  find: typeof findFonts
  install: typeof installFont
}

/**
 * Find a font and the search it opens, finding once typing rests. Escape
 * closes the search and hands focus back to Find a font.
 */
function FindFont({ project, installed, find, install }: FindFontProps) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [search, setSearch] = useState<Search>({ state: 'idle' })
  const [installing, setInstalling] = useState<ReadonlySet<string>>(new Set())
  const [problem, setProblem] = useState<string | null>(null)
  const opener = useRef<HTMLButtonElement>(null)
  const closed = useRef(false)

  useEffect(() => {
    if (!open && closed.current) {
      closed.current = false
      opener.current?.focus()
    }
  }, [open])

  const typed = text.trim()
  useEffect(() => {
    if (!open || typed === '') return
    const abort = new AbortController()
    const rest = setTimeout(() => {
      setSearch({ state: 'searching' })
      find(project, typed, abort.signal)
        .then((found) => setSearch({ state: 'found', find: found }))
        .catch((error: unknown) => {
          if (abort.signal.aborted) return
          setSearch({ state: 'failed', message: searchFailure(error) })
        })
    }, SEARCH_REST_MS)
    return () => {
      clearTimeout(rest)
      abort.abort()
    }
  }, [open, typed, project, find])

  const close = () => {
    closed.current = true
    setOpen(false)
    setText('')
    setSearch({ state: 'idle' })
    setProblem(null)
  }

  const run = async (result: FontResult) => {
    setInstalling((current) => new Set(current).add(result.id))
    setProblem(null)
    try {
      await install(project, result.id, typed || null)
    } catch (error) {
      setProblem(
        `Couldn’t install ${result.family}. ${error instanceof Error ? error.message : String(error)}`,
      )
    } finally {
      setInstalling((current) => {
        const next = new Set(current)
        next.delete(result.id)
        return next
      })
    }
  }

  if (!open) {
    return (
      <button
        ref={opener}
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 -ml-1 flex h-6 items-center gap-1 rounded-[5px] px-1 text-xs font-medium text-primary outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <Plus aria-hidden className="size-3" />
        Find a font
      </button>
    )
  }

  // A cleared field shows no stale results while the next search waits to run.
  const shown: Search = typed === '' ? { state: 'idle' } : search
  const found = shown.state === 'found' ? shown.find : null
  return (
    <div
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          close()
        }
      }}
    >
      <label className="mt-1 flex h-7 items-center gap-2 rounded-md border border-border bg-background px-2 text-xs text-foreground focus-within:ring-2 focus-within:ring-ring/50">
        <span className="sr-only">Search Fontsource by name or category</span>
        <input
          type="search"
          // The field opens from Find a font, a press asking to type.
          // oxlint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          value={text}
          onChange={(event) => setText(event.target.value)}
          className="min-w-0 flex-1 bg-transparent outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        <span
          aria-live="polite"
          className="shrink-0 text-label text-muted-foreground tabular-nums"
        >
          {shown.state === 'searching'
            ? 'Searching'
            : found
              ? `${found.total} found`
              : null}
        </span>
      </label>
      {shown.state === 'failed' ? (
        <p role="alert" className="pt-1 leading-[1.45] text-destructive">
          {shown.message}
        </p>
      ) : null}
      {found && found.results.length === 0 ? (
        <p className="pt-1 leading-[1.45] text-muted-foreground">
          Nothing matched “{typed}”. Try part of a name, or a category such as
          serif or monospace.
        </p>
      ) : null}
      {found && found.results.length > 0 ? (
        <>
          <SampleFaces results={found.results} />
          <ul
            aria-label="Fonts found"
            className="-mx-1 mt-1 max-h-64 overflow-y-auto px-1"
          >
            {found.results.map((result) => (
              <ResultRow
                key={result.id}
                result={result}
                held={heldAs(result, installed)}
                installing={installing.has(result.id)}
                onInstall={(picked) => void run(picked)}
              />
            ))}
          </ul>
          {found.total > found.results.length ? (
            <p className="pt-1 leading-[1.45] text-muted-foreground">
              Showing the first {found.results.length} of {found.total}. Type
              more of a name to narrow them.
            </p>
          ) : null}
        </>
      ) : null}
      {problem ? (
        <p role="alert" className="pt-1 leading-[1.45] text-destructive">
          {problem}
        </p>
      ) : null}
      <p className="pt-1 leading-[1.45] text-muted-foreground">
        From Fontsource. Each font saves into this project with its license.
      </p>
    </div>
  )
}

function ResultRow({
  result,
  held,
  installing,
  onInstall,
}: {
  result: FontResult
  held: 'Installed' | 'Built in' | null
  installing: boolean
  onInstall: (result: FontResult) => void
}) {
  return (
    <li className="group flex min-h-8 items-center gap-2">
      <span
        className="min-w-0 flex-1 truncate text-[15px] leading-tight group-focus-within:whitespace-normal"
        style={{ fontFamily: `"${sampleFamily(result)}", var(--font-sans)` }}
      >
        {result.family}
      </span>
      <span className="shrink-0 text-label text-muted-foreground">
        {held ?? (installing ? 'Installing' : licenseMark(result.license))}
      </span>
      {held === null ? (
        <button
          type="button"
          aria-label={`Install ${result.family}`}
          disabled={installing}
          onClick={() => onInstall(result)}
          className="flex h-6 shrink-0 items-center rounded-[5px] px-1.5 text-xs font-medium text-primary outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40"
        >
          Install
        </button>
      ) : null}
    </li>
  )
}

/**
 * Declares each result's sample file under a family of its own, so its name
 * draws in its face before it is installed, and in the board's face where the
 * sample does not load.
 */
function SampleFaces({ results }: { results: readonly FontResult[] }) {
  const rules = results.flatMap((result) => {
    const url = safeSample(result.sample)
    return url
      ? [
          `@font-face{font-family:"${sampleFamily(result)}";src:url("${url}") format("woff2");font-display:swap}`,
        ]
      : []
  })
  return <style>{rules.join('')}</style>
}

/** A sample's address when it is a plain https URL, whose href percent-encodes any quote. */
function safeSample(sample: string): string | null {
  try {
    const url = new URL(sample)
    return url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

function sampleFamily(result: FontResult): string {
  return `frameboard-sample-${result.id.replace(/[^a-z0-9-]/gi, '')}`
}

/** Whether a result is already one the project's frames may name. */
function heldAs(
  result: FontResult,
  installed: readonly InstalledFont[],
): 'Installed' | 'Built in' | null {
  const family = result.family.toLowerCase()
  const isInstalled = installed.some(
    (font) => font.id === result.id || font.family.toLowerCase() === family,
  )
  if (isInstalled) return 'Installed'
  return FACES.some((face) => face.family.toLowerCase() === family)
    ? 'Built in'
    : null
}

function searchFailure(error: unknown): string {
  if (error instanceof BoardWriteError && error.code === 'source-failed') {
    return 'Fontsource didn’t answer, so nothing can be found right now. Check the connection and search again.'
  }
  return error instanceof Error ? error.message : String(error)
}

function RemoveButton({
  font,
  busy,
  onRemove,
}: {
  font: InstalledFont
  busy: boolean
  onRemove: (font: InstalledFont) => void
}) {
  return (
    <button
      type="button"
      aria-label={`Remove ${font.family}`}
      disabled={busy}
      onClick={() => onRemove(font)}
      className="grid size-5 shrink-0 place-items-center rounded-[5px] text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40"
    >
      <X aria-hidden className="size-3" />
    </button>
  )
}

function familyRows(installed: readonly InstalledFont[]): FamilyRow[] {
  const taken = new Set(installed.map((font) => font.family.toLowerCase()))
  const builtIn = FACES.filter(
    (face) => !taken.has(face.family.toLowerCase()),
  ).map((face) => ({
    family: face.family,
    stack: faceStack(face),
    source: 'Built in',
    installed: null,
  }))
  const own = installed.map((font) => ({
    family: font.family,
    stack: `'${font.family}', sans-serif`,
    source: licenseMark(font.license),
    installed: font,
  }))
  return [...builtIn, ...own]
}

/** A license's short mark, as `OFL-1.1` reads `OFL`. */
function licenseMark(license: string): string {
  return license.replace(/-[\d.]+$/, '')
}

/**
 * The project's font sheet, addressed by what it holds so the browser reads
 * it again once a family is installed or removed.
 */
function projectSheet(
  project: string,
  installed: readonly InstalledFont[],
): string {
  const held = installed.map((font) => font.id).join(',')
  return `/frames/${encodeURIComponent(project)}/${FONT_SHEET}?fonts=${encodeURIComponent(held)}`
}

/** The frames a removal leaves falling back, none where the board serves the family too. */
function warnsOn(font: InstalledFont): readonly string[] {
  return font.bundled ? [] : font.frames
}

/** The sentence naming the frames a removal leaves falling back, by frame name. */
function fallingBack(
  refs: readonly string[],
  board: ListResult | null,
): string {
  const names = refs.map((ref) => frameName(ref, board))
  const shown = names.slice(0, NAMED_FRAMES).join(', ')
  const more = names.length - NAMED_FRAMES
  const list = more > 0 ? `${shown}, and ${more} more` : shown
  return names.length === 1
    ? `The frame ${list} uses it and falls back to another face.`
    : `The ${names.length} frames using it fall back to another face: ${list}.`
}

function frameName(ref: string, board: ListResult | null): string {
  for (const project of board?.projects ?? []) {
    for (const page of project.pages) {
      const frame = page.frames.find((candidate) => candidate.ref === ref)
      if (frame) return frame.name
    }
  }
  return ref.slice(ref.lastIndexOf('/') + 1)
}
