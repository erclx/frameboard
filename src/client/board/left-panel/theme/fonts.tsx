import { Plus, X } from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'

import { Button } from '@/client/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/client/components/ui/dialog'
import { toast } from '@/client/components/ui/toast'
import { useLive } from '@/client/live/store'
import { BoardWriteError } from '@/client/live/write'
import { FACES, faceSheetUrl } from '@/shared/faces'
import type { ListResult } from '@/shared/records/list'
import type {
  FontFind,
  FontList,
  FontResult,
  InstalledFont,
} from '@/shared/records/sourcing'

import {
  fetchFontFrames,
  findFonts,
  installedFontSheet,
} from '../../assets/sourcing'
import { familyRows, licenseMark } from './families'
import { focusAfterConfirm } from './focus'
import { HEAD_BUTTON, SectionHead } from './section-head'
import { installFont, removeFont } from './write'

/** How many frame names the removal confirmation spells out before counting the rest. */
const NAMED_FRAMES = 5

interface FontsSectionProps {
  project: string
  /** The project's installed fonts, undefined while they read and null when the read failed. */
  list: FontList | null | undefined
  /** Whether the section is in view, false while it is leaving and still mounted. */
  drawn?: boolean
  /** Reads the frames drawing text in one font, as a removal asks. */
  readFrames?: typeof fetchFontFrames
  find?: typeof findFonts
  install?: typeof installFont
  remove?: typeof removeFont
}

/** A removal waiting on its confirmation, with the frames it leaves falling back. */
interface Confirming {
  font: InstalledFont
  frames: readonly string[]
}

/**
 * Shows a refusal inline while `inline` says its place is drawn, and as an
 * error toast once the search closed or the section started leaving, so no
 * refusal goes unsaid.
 */
function reportTo(
  inline: { current: boolean },
  show: (message: string) => void,
) {
  return (title: string, error: unknown) => {
    const description = error instanceof Error ? error.message : String(error)
    if (inline.current) show(`${title}. ${description}`)
    else toast.add({ title, description, type: 'error' })
  }
}

/**
 * A ref reading true while the component is mounted and `drawn` holds. The two
 * differ as a tab panel or a dialog leaves, which unmounts frames later.
 */
function useDrawn(drawn: boolean): { current: boolean } {
  const ref = useRef(drawn)
  useEffect(() => {
    ref.current = drawn
    return () => {
      ref.current = false
    }
  }, [drawn])
  return ref
}

/** How long typing rests before the search runs, so each keystroke sends no request. */
const SEARCH_REST_MS = 250

/** The faces every family draws from, for the cards and the dialog alike. */
export function FontFaces({ list }: Pick<FontsSectionProps, 'list'>) {
  return (
    <>
      {FACES.map((face) => (
        <link key={face.folder} rel="stylesheet" href={faceSheetUrl(face)} />
      ))}
      {list?.fonts.length ? (
        <link rel="stylesheet" href={installedFontSheet(list)} />
      ) : null}
    </>
  )
}

/**
 * Every family the project's frames may name, built in then installed, each
 * in its own face. An installed family the board also serves lists once, as
 * installed, since that specimen is the one removal acts on.
 */
export function FontsSection({
  project,
  list,
  drawn = true,
  readFrames = fetchFontFrames,
  find = findFonts,
  install = installFont,
  remove = removeFont,
}: FontsSectionProps) {
  const canWrite = useLive((state) => state.canWrite)
  const board = useLive((state) => state.board)
  const installed = list?.fonts ?? []
  const [confirming, setConfirming] = useState<Confirming | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const report = reportTo(useDrawn(drawn), setProblem)
  const reading = useRef(false)
  const section = useRef<HTMLElement>(null)
  const pressed = useRef<HTMLElement | null>(null)

  const rows = familyRows(installed)

  const run = async (font: InstalledFont) => {
    setRemoving(font.id)
    setProblem(null)
    try {
      await remove(project, font.id)
    } catch (error) {
      report(`Couldn’t remove ${font.family}`, error)
    } finally {
      setRemoving(null)
    }
  }

  // One read at a time, and none for a family the board also serves, whose frames keep drawing.
  const ask = async (font: InstalledFont) => {
    if (reading.current) return
    if (font.bundled) return run(font)
    reading.current = true
    setRemoving(font.id)
    setProblem(null)
    try {
      const frames = await readFrames(project, font.id)
      if (frames.length > 0) setConfirming({ font, frames })
      else await run(font)
    } catch (error) {
      report(`Couldn’t remove ${font.family}`, error)
    } finally {
      reading.current = false
      setRemoving(null)
    }
  }

  return (
    <section
      ref={section}
      aria-labelledby="theme-fonts"
      className="flex flex-col gap-3"
    >
      {canWrite ? (
        <FindFont
          project={project}
          installed={installed}
          drawn={drawn}
          find={find}
          install={install}
        />
      ) : (
        <>
          <SectionHead id="theme-fonts" title="Fonts" />
          <p className="text-muted-foreground">
            View only, so fonts can’t be added or removed here.
          </p>
        </>
      )}
      {list === null ? (
        <p className="text-muted-foreground">
          The installed fonts did not load. Reload the board to try again.
        </p>
      ) : null}
      {problem ? (
        <p role="alert" className="leading-[1.45] text-destructive">
          {problem}
        </p>
      ) : null}
      <ul aria-label="Fonts frames can use" className={GRID}>
        {rows.map((row) => (
          <Specimen
            key={row.family}
            family={row.family}
            stack={row.stack}
            note={row.source}
          >
            {row.installed && canWrite ? (
              <RemoveButton
                font={row.installed}
                busy={removing === row.installed.id}
                onRemove={(font, button) => {
                  pressed.current = button
                  void ask(font)
                }}
              />
            ) : null}
          </Specimen>
        ))}
      </ul>
      <Dialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open) setConfirming(null)
        }}
      >
        <DialogContent
          showCloseButton={false}
          finalFocus={() => focusAfterConfirm(pressed.current, section.current)}
          className="gap-3 p-4"
        >
          <DialogTitle className="text-title font-semibold">
            Remove {confirming?.font.family}?
          </DialogTitle>
          <DialogDescription>
            {confirming ? fallingBack(confirming.frames, board) : null} Undo
            brings the font back.
          </DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (confirming) void run(confirming.font)
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

const GRID = 'grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2.5'

/** One family's tile, two letters in its own face over its name and where it came from. */
function Specimen({
  family,
  stack,
  note,
  children,
}: {
  family: string
  stack: string
  note: string
  /** What the tile does, at its corner. */
  children: ReactNode
}) {
  return (
    <li className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] content-start gap-y-0.5 rounded-lg bg-secondary p-2.5">
      <span
        aria-hidden
        className="overflow-hidden text-(length:--text-title) leading-7"
        style={{ fontFamily: stack }}
      >
        Aa
      </span>
      <span className="col-span-2 font-semibold [overflow-wrap:anywhere]">
        {family}
      </span>
      <span className="col-span-2 text-muted-foreground">{note}</span>
      <span className="col-start-2 row-start-1">{children}</span>
    </li>
  )
}

type Search =
  | { state: 'idle' }
  | { state: 'searching' }
  | { state: 'found'; find: FontFind; text: string }
  | { state: 'failed'; message: string }

interface FindFontProps {
  project: string
  installed: readonly InstalledFont[]
  drawn: boolean
  find: typeof findFonts
  install: typeof installFont
}

/**
 * The section's heading beside Find a font, or the search that opens in its
 * place, focused since the press asked to type. It finds once typing rests,
 * and Escape hands focus back to Find a font.
 */
function FindFont({ project, installed, drawn, find, install }: FindFontProps) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [search, setSearch] = useState<Search>({ state: 'idle' })
  const [installing, setInstalling] = useState<ReadonlySet<string>>(new Set())
  const [problem, setProblem] = useState<string | null>(null)
  const opener = useRef<HTMLButtonElement>(null)
  const field = useRef<HTMLInputElement>(null)
  const closed = useRef(false)
  const report = reportTo(useDrawn(drawn && open), setProblem)

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
        .then((found) =>
          setSearch({ state: 'found', find: found, text: typed }),
        )
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

  // The query recorded is the one whose answer drew the result, never text typed since.
  const run = async (
    result: FontResult,
    query: string,
    pressed: HTMLElement,
  ) => {
    if (installing.has(result.id)) return
    setInstalling((current) => new Set(current).add(result.id))
    setProblem(null)
    try {
      await install(project, result.id, query || null)
      // The pressed Install unmounts once its row reads Installed. Focus the person moved elsewhere stays there.
      const active = document.activeElement
      if (active === pressed || active === null || active === document.body) {
        field.current?.focus()
      }
    } catch (error) {
      report(`Couldn’t install ${result.family}`, error)
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
      <SectionHead id="theme-fonts" title="Fonts">
        <Button
          ref={opener}
          variant="outline"
          size="sm"
          className={HEAD_BUTTON}
          onClick={() => setOpen(true)}
        >
          <Plus aria-hidden />
          Find a font
        </Button>
      </SectionHead>
    )
  }

  // A cleared field shows no stale results while the next search waits to run.
  const shown: Search = typed === '' ? { state: 'idle' } : search
  const found = shown.state === 'found' ? shown.find : null
  return (
    <div
      className="flex flex-col gap-3"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          close()
        }
      }}
    >
      <SectionHead id="theme-fonts" title="Fonts">
        <div className="flex h-7 w-72 max-w-full min-w-0 items-center gap-2 rounded-md bg-input px-2 focus-within:ring-2 focus-within:ring-ring">
          <input
            ref={field}
            type="search"
            aria-label="Search Fontsource by name or category"
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
        </div>
      </SectionHead>
      {shown.state === 'failed' ? (
        <p role="alert" className="leading-[1.45] text-destructive">
          {shown.message}
        </p>
      ) : null}
      {found && found.results.length === 0 ? (
        <p className="text-muted-foreground">
          Nothing matched “{shown.state === 'found' ? shown.text : typed}”. Try
          part of a name, or a category such as serif or monospace.
        </p>
      ) : null}
      {found && found.results.length > 0 ? (
        <>
          <SampleFaces results={found.results} />
          <ul aria-label="Fonts found" className={GRID}>
            {found.results.map((result) => (
              <ResultSpecimen
                key={result.id}
                result={result}
                held={heldAs(result, installed)}
                stack={heldStack(result, installed)}
                installing={installing.has(result.id)}
                onInstall={(picked, pressed) =>
                  void run(
                    picked,
                    shown.state === 'found' ? shown.text : typed,
                    pressed,
                  )
                }
              />
            ))}
          </ul>
          {found.total > found.results.length ? (
            <p className="text-muted-foreground">
              Showing the first {found.results.length} of {found.total}. Type
              more of a name to narrow them.
            </p>
          ) : null}
        </>
      ) : null}
      {problem ? (
        <p role="alert" className="leading-[1.45] text-destructive">
          {problem}
        </p>
      ) : null}
      <p className="border-b border-border pb-3 text-muted-foreground">
        From Fontsource. Each font saves into this project with its license.
      </p>
    </div>
  )
}

function ResultSpecimen({
  result,
  held,
  stack,
  installing,
  onInstall,
}: {
  result: FontResult
  held: 'Installed' | 'Built in' | null
  /** The stack a family the project holds draws in, null for one it does not. */
  stack: string | null
  installing: boolean
  onInstall: (result: FontResult, pressed: HTMLElement) => void
}) {
  return (
    <Specimen
      family={result.family}
      stack={stack ?? `"${sampleFamily(result)}", var(--font-sans)`}
      note={held ?? (installing ? 'Installing' : licenseMark(result.license))}
    >
      {held === null ? (
        <Button
          variant="outline"
          size="xs"
          aria-label={`Install ${result.family}`}
          // Kept focusable while it runs, since disabling the focused button drops focus to the page.
          aria-disabled={installing || undefined}
          onClick={(event) => onInstall(result, event.currentTarget)}
          className="bg-card aria-disabled:cursor-default aria-disabled:opacity-40 dark:bg-card"
        >
          Install
        </Button>
      ) : null}
    </Specimen>
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

/** The stack of a family a project's frames may already name, which draws whether its sample loads or not. */
function heldStack(
  result: FontResult,
  installed: readonly InstalledFont[],
): string | null {
  const family = result.family.toLowerCase()
  const row = familyRows(installed).find(
    (held) =>
      held.installed?.id === result.id || held.family.toLowerCase() === family,
  )
  return row?.stack ?? null
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
  onRemove: (font: InstalledFont, button: HTMLElement) => void
}) {
  return (
    <button
      type="button"
      aria-label={`Remove ${font.family}`}
      // Kept focusable while its frames read, so Cancel on the dialog has a button to hand focus back to.
      aria-disabled={busy || undefined}
      onClick={(event) => {
        if (!busy) onRemove(font, event.currentTarget)
      }}
      className="grid size-6 shrink-0 place-items-center rounded-[5px] text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring aria-disabled:cursor-default aria-disabled:opacity-40"
    >
      <X aria-hidden className="size-3" />
    </button>
  )
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
