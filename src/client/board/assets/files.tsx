import { ChevronDown, ChevronRight, Plus, Search } from 'lucide-react'
import {
  type DragEvent,
  Fragment,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react'

import { reportRefusal } from '@/client/board/left-panel/page-actions'
import { leftTabStore } from '@/client/board/left-panel/tab-store'
import type { AssetMenuActs } from '@/client/board/menus/asset'
import { placeAtCenter } from '@/client/board/place/write'
import { canvasView } from '@/client/board/view'
import { Button } from '@/client/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/client/components/ui/dialog'
import { useLive } from '@/client/live/store'
import type {
  AssetAddResult,
  AssetFile,
  AssetList,
} from '@/shared/records/assets'
import type { FontList } from '@/shared/records/sourcing'

import { frameLabel } from './describe'
import { isPlaceable, type PlaceableFile } from './drag'
import {
  type AssetGroup,
  type Chip,
  CHIP_LABELS,
  chipCounts,
  fileName,
  groupAssets,
  withoutFonts,
  withoutKits,
} from './groups'
import { fetchAssets } from './list'
import { fetchInstalledFonts, useInstalledFonts } from './sourcing'
import { Tile } from './tile'
import { ASSET_WRITES, type AssetWrites, uploadAssets } from './upload'

const CODE = 'font-mono text-label font-normal text-foreground'

interface FilesViewProps {
  project: string
  /** Reads the project's files, the API in the app. */
  load?: (project: string) => Promise<AssetList | null>
  /** Reads the project's installed fonts, whose folders the Theme tab manages, the API in the app. */
  loadFonts?: (project: string) => Promise<FontList | null>
  /** Posts a drop, the API in the app. */
  upload?: (project: string, files: File[]) => Promise<AssetAddResult>
  /** Renames, replaces, deletes, and reads the frames linking a file, the API in the app. */
  writes?: AssetWrites
  /** Lands a file in a new frame at the view's center, `placeAtCenter` in the app. */
  place?: (file: PlaceableFile) => void
}

/** The file Delete asks about and the frames linking it, which the confirm names. */
interface Deleting {
  path: string
  frames: string[]
}

/**
 * The Assets tab's Files view, re-reading the list on every board message
 * while open, so a file an agent wrote shows without a reload. It holds
 * which tile renames, the Delete confirm, and each replaced file's version.
 */
export function FilesView({
  project,
  load = fetchAssets,
  loadFonts = fetchInstalledFonts,
  upload = uploadAssets,
  writes = ASSET_WRITES,
  place = placeAtCenter,
}: FilesViewProps) {
  const canWrite = useLive((state) => state.canWrite)
  const [reads, setReads] = useState(0)
  const list = useAssetList(project, load, reads)
  const installedFonts = useInstalledFonts(project, loadFonts)
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [refusals, setRefusals] = useState<{ id: string; text: string }[]>([])
  const picker = useRef<HTMLInputElement>(null)
  const replacer = useRef<HTMLInputElement>(null)
  const replacing = useRef<string | null>(null)
  const [search, setSearch] = useState('')
  const [picked, setPicked] = useState<Chip>('all')
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())
  const [renaming, setRenaming] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<Deleting | null>(null)
  const [versions, setVersions] = useState<Readonly<Record<string, number>>>({})

  /** Runs one write, toasting a refusal, and reads the list again after it either way. */
  async function written(title: string, write: () => Promise<unknown>) {
    try {
      await write()
    } catch (error) {
      reportRefusal(title)(error)
    } finally {
      setReads((count) => count + 1)
    }
  }

  function rename(path: string, name: string) {
    setRenaming(null)
    void written('Couldn’t rename the file', () =>
      writes.rename(project, path, name),
    )
  }

  function replace(path: string, file: File) {
    void written('Couldn’t replace the file', async () => {
      await writes.replace(project, path, file)
      setVersions((current) => ({
        ...current,
        [path]: (current[path] ?? 0) + 1,
      }))
    })
  }

  function remove(path: string) {
    void written('Couldn’t delete the file', () => writes.remove(project, path))
  }

  /** Deletes a file no frame links at once, and asks first, naming them, for one some frame does. */
  async function askDelete(file: AssetFile) {
    if (file.frames === 0) {
      remove(file.path)
      return
    }
    try {
      const frames = await writes.frames(project, file.path)
      if (frames.length === 0) remove(file.path)
      else setDeleting({ path: file.path, frames })
    } catch (error) {
      reportRefusal('Couldn’t delete the file')(error)
    }
  }

  function actsFor(file: AssetFile): Omit<AssetMenuActs, 'copy'> {
    if (!canWrite) return {}
    return {
      place:
        isPlaceable(file) && canvasView.page() !== null
          ? () => place({ project, path: file.path, kind: file.kind })
          : undefined,
      rename: () => setRenaming(file.path),
      replace: () => {
        replacing.current = file.path
        replacer.current?.click()
      },
      remove: () => void askDelete(file),
    }
  }

  async function add(files: File[]) {
    if (!canWrite || files.length === 0) return
    setBusy(true)
    try {
      const result = await upload(project, files)
      setRefusals(
        result.refused.map((entry) => ({
          id: crypto.randomUUID(),
          text: `${entry.name}: ${entry.message}`,
        })),
      )
    } catch (error) {
      setRefusals([
        {
          id: crypto.randomUUID(),
          text: error instanceof Error ? error.message : String(error),
        },
      ])
    } finally {
      setBusy(false)
      setReads((count) => count + 1)
    }
  }

  function onDrop(event: DragEvent) {
    if (!hasFiles(event)) return
    event.preventDefault()
    setOver(false)
    void add(droppedFiles(event))
  }

  if (list === undefined) return null
  if (list === null) {
    return (
      <p className="m-3 text-muted-foreground">
        The assets did not load. Reload the board to try again.
      </p>
    )
  }
  const { files: unkitted, kits } = withoutKits(list.files)
  const { files, fonts } = withoutFonts(
    unkitted,
    installedFonts?.fonts.map((font) => font.path) ?? [],
  )
  const count = files.length
  const chips = chipCounts(files)
  // A chip whose last file went away falls back to All rather than hiding every tile.
  const chip = chips.some((entry) => entry.chip === picked) ? picked : 'all'
  const groups = groupAssets(files, { chip, search })
  const clearFilter = () => {
    setSearch('')
    setPicked('all')
  }
  const toggle = (folder: string) =>
    setCollapsed((current) => {
      const next = new Set(current)
      if (!next.delete(folder)) next.add(folder)
      return next
    })

  return (
    <div
      aria-busy={busy}
      onDragEnter={(event) => hasFiles(event) && setOver(true)}
      onDragOver={(event) => {
        if (!hasFiles(event)) return
        event.preventDefault()
        setOver(true)
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setOver(false)
        }
      }}
      onDrop={onDrop}
      className={`flex h-full flex-col overflow-y-auto pb-2 ${over && canWrite ? 'bg-primary/5 ring-[1.5px] ring-primary ring-inset' : ''}`}
    >
      <div className="flex items-center justify-between pt-2.5 pr-1.5 pb-1 pl-3 text-label text-muted-foreground">
        <h3>
          assets/ · {count} {count === 1 ? 'file' : 'files'}
        </h3>
        <button
          type="button"
          aria-label="Add files"
          disabled={!canWrite}
          onClick={() => picker.current?.click()}
          className="grid size-5 place-items-center rounded-md outline-none hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 disabled:hover:bg-transparent"
        >
          <Plus aria-hidden className="size-3.5" />
        </button>
        <input
          ref={picker}
          type="file"
          multiple
          hidden
          aria-label="Choose files to add"
          onChange={(event) => {
            const chosen = [...(event.target.files ?? [])]
            event.target.value = ''
            void add(chosen)
          }}
        />
        <input
          ref={replacer}
          type="file"
          hidden
          aria-label="Choose a file to replace it with"
          onChange={(event) => {
            const [chosen] = event.target.files ?? []
            const path = replacing.current
            event.target.value = ''
            replacing.current = null
            if (chosen && path !== null) replace(path, chosen)
          }}
        />
      </div>
      {count === 0 ? (
        <p className="mx-3 my-1 text-muted-foreground">
          No files in <code className={CODE}>assets/</code> yet.
        </p>
      ) : (
        <>
          <div className="mx-2 mt-1 mb-1.5 flex h-[26px] shrink-0 items-center gap-1.5 rounded-md bg-muted px-2 focus-within:ring-[1.5px] focus-within:ring-primary">
            <Search
              aria-hidden
              className="size-[13px] shrink-0 text-muted-foreground"
            />
            <input
              type="search"
              aria-label="Search assets"
              placeholder="Search assets"
              value={search}
              spellCheck={false}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Escape' || search === '') return
                event.preventDefault()
                event.stopPropagation()
                setSearch('')
              }}
              className="min-w-0 flex-1 bg-transparent text-label outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
            />
          </div>
          <div
            role="group"
            aria-label="Filter by kind"
            className="flex flex-wrap gap-1 px-2 pb-1.5"
          >
            {chips.map((entry) => (
              <button
                key={entry.chip}
                type="button"
                aria-pressed={entry.chip === chip}
                onClick={() => setPicked(entry.chip)}
                className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-2 text-[10px] outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${entry.chip === chip ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
              >
                {CHIP_LABELS[entry.chip]}
                {entry.chip === 'all' ? null : ` ${entry.count}`}
              </button>
            ))}
          </div>
          {groups.length === 0 ? (
            <div className="mx-3 my-1 text-muted-foreground">
              <p>{noMatch(search, chip)}</p>
              <button
                type="button"
                onClick={clearFilter}
                className="mt-1 rounded-sm text-foreground underline underline-offset-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                Clear filter
              </button>
            </div>
          ) : (
            groups.map((group) => (
              <Group
                key={group.folder}
                group={group}
                open={!collapsed.has(group.folder)}
                onToggle={() => toggle(group.folder)}
                tile={(file) => (
                  <Tile
                    key={file.path}
                    project={project}
                    file={file}
                    version={versions[file.path]}
                    acts={actsFor(file)}
                    loadFrames={() => writes.frames(project, file.path)}
                    rename={
                      renaming === file.path
                        ? {
                            commit: (name) => rename(file.path, name),
                            cancel: () => setRenaming(null),
                          }
                        : undefined
                    }
                  />
                )}
              />
            ))
          )}
        </>
      )}
      {kits > 0 || fonts > 0 ? (
        <p className="mx-3 mt-1.5 mb-0.5 text-[10px] leading-[1.4] text-muted-foreground">
          {managed(kits, fonts)} managed in the{' '}
          <button
            type="button"
            onClick={() => leftTabStore.setState({ tab: 'theme' })}
            className="rounded-sm text-foreground underline underline-offset-2 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            Theme tab
          </button>
          .
        </p>
      ) : null}
      <div className="m-2 rounded-[10px] border-[1.5px] border-dashed border-border p-3 text-center leading-normal text-muted-foreground">
        {canWrite ? (
          <>
            <span>
              {busy ? 'Adding files…' : 'Drop files here to add them.'}
            </span>
            <br />A frame links one as{' '}
            <code className={CODE}>../assets/hero.png</code>
          </>
        ) : (
          <>
            This tab is read-only, so files cannot be added. Run{' '}
            <code className={CODE}>frameboard open</code> for a tab that can.
          </>
        )}
      </div>
      {refusals.length > 0 ? (
        <ul role="alert" className="mx-3 text-destructive">
          {refusals.map((refusal) => (
            <li key={refusal.id} className="leading-[1.45]">
              {refusal.text}
            </li>
          ))}
        </ul>
      ) : null}
      <Dialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
      >
        <DialogContent showCloseButton={false} className="gap-3 p-4">
          <DialogTitle className="text-title font-semibold">
            Delete {deleting ? fileName(deleting.path) : null}?
          </DialogTitle>
          <DialogDescription>
            {deleting ? deleteWarning(deleting.frames) : null}
          </DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deleting) remove(deleting.path)
                setDeleting(null)
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** The listed frames past which Delete's confirm counts the rest. */
const NAMED_FRAMES = 3

/** Delete's warning, naming the frames whose link breaks and saying Undo brings the file back. */
function deleteWarning(frames: readonly string[]): ReactNode {
  const named = frames.slice(0, NAMED_FRAMES)
  const rest = frames.length - named.length
  const parts: ReactNode[] = named.map((ref) => (
    <b key={ref} className="font-medium text-foreground">
      {frameLabel(ref)}
    </b>
  ))
  if (rest > 0) parts.push(`${rest} more`)
  return (
    <>
      {frames.length === 1 ? 'Its link in ' : 'Its links in '}
      {parts.map((part, index) => (
        // oxlint-disable-next-line react/no-array-index-key -- the parts are fixed in order for one render
        <Fragment key={index}>
          {index === 0 ? null : index === parts.length - 1 ? ' and ' : ', '}
          {part}
        </Fragment>
      ))}
      {frames.length === 1 ? ' breaks' : ' break'}, which the link check
      reports. Undo brings the file back.
    </>
  )
}

interface GroupProps {
  group: AssetGroup
  open: boolean
  onToggle: () => void
  /** Draws one file's tile. */
  tile: (file: AssetFile) => ReactNode
}

/** One folder's tiles under a heading that collapses them, `assets/` naming the folder's own files. */
function Group({ group, open, onToggle, tile }: GroupProps) {
  const Caret = open ? ChevronDown : ChevronRight
  const count = group.files.length
  return (
    <section aria-label={group.folder === '' ? 'assets/' : group.folder}>
      <h4>
        <button
          type="button"
          aria-expanded={open}
          onClick={onToggle}
          className="mx-1 flex items-center gap-1 rounded-md px-1.5 py-1 text-label font-semibold outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Caret aria-hidden className="size-3 text-muted-foreground" />
          {group.folder === '' ? 'assets/' : group.folder}
          <span className="font-normal text-muted-foreground">· {count}</span>
        </button>
      </h4>
      {open ? (
        <ul className="grid grid-cols-2 gap-2 px-2 pt-0.5 pb-2">
          {group.files.map(tile)}
        </ul>
      ) : null}
    </section>
  )
}

/** The no-match line, naming the search and the chip that left nothing. */
function noMatch(search: string, chip: Chip): string {
  const files = chip === 'all' ? 'files' : `${CHIP_NOUNS[chip]} files`
  const query = search.trim()
  return query === '' ? `No ${files} here.` : `No ${files} match "${query}".`
}

const CHIP_NOUNS: Record<Exclude<Chip, 'all'>, string> = {
  images: 'image',
  video: 'video',
  audio: 'audio',
  models: 'model',
  fonts: 'font',
  other: 'other',
}

function hasFiles(event: DragEvent): boolean {
  return event.dataTransfer.types.includes('Files')
}

/** The dropped files, leaving out any folder. */
function droppedFiles(event: DragEvent): File[] {
  const { items, files } = event.dataTransfer
  const kept: File[] = []
  for (const [index, file] of [...files].entries()) {
    const entry = items[index]?.webkitGetAsEntry?.()
    if (!entry?.isDirectory) kept.push(file)
  }
  return kept
}

/**
 * The project's file list, read again on every board message and after each
 * drop. Undefined while the first read runs and null when it fails, and a
 * slower earlier read never replaces a later one.
 */
function useAssetList(
  project: string,
  load: (project: string) => Promise<AssetList | null>,
  reads: number,
): AssetList | null | undefined {
  const board = useLive((state) => state.board)
  const [list, setList] = useState<AssetList | null | undefined>()

  useEffect(() => {
    let current = true
    void load(project)
      .catch(() => null)
      .then((next) => {
        if (current) setList(next)
      })
    return () => {
      current = false
    }
  }, [project, board, load, reads])

  return list
}

/** What the Theme tab manages, as `2 kits and 1 font are`, leaving out a count of none. */
function managed(kits: number, fonts: number): string {
  const kitPart = kits === 1 ? '1 kit' : `${kits} kits`
  const fontPart = fonts === 1 ? '1 font' : `${fonts} fonts`
  const named = [kits > 0 ? kitPart : null, fonts > 0 ? fontPart : null]
  const shown = named.filter((part) => part !== null).join(' and ')
  return `${shown} ${kits + fonts === 1 ? 'is' : 'are'}`
}
