import { ChevronDown, ChevronRight, Plus, Search } from 'lucide-react'
import { type DragEvent, useEffect, useRef, useState } from 'react'

import { useLive } from '@/client/live/store'
import type { AssetAddResult, AssetList } from '@/shared/records/assets'

import {
  type AssetGroup,
  type Chip,
  CHIP_LABELS,
  chipCounts,
  groupAssets,
} from './groups'
import { fetchAssets } from './list'
import { Tile } from './tile'
import { uploadAssets } from './upload'

const CODE = 'font-mono text-label font-normal text-foreground'

interface AssetsTabProps {
  project: string
  /** Reads the project's files, the API in the app. */
  load?: (project: string) => Promise<AssetList | null>
  /** Posts a drop, the API in the app. */
  upload?: (project: string, files: File[]) => Promise<AssetAddResult>
}

/**
 * The Assets tab of `canon/design/tabs/assets`: the project's `assets/` files
 * as tiles grouped by folder, narrowed by a name search and a kind chip, a
 * click copying the path a frame links one by, and a drop or the header's
 * picker adding files. It reads the list again on every board message while
 * open, so a file an agent wrote shows without a reload.
 */
export function AssetsTab({
  project,
  load = fetchAssets,
  upload = uploadAssets,
}: AssetsTabProps) {
  const canWrite = useLive((state) => state.canWrite)
  const [reads, setReads] = useState(0)
  const list = useAssetList(project, load, reads)
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [refusals, setRefusals] = useState<{ id: string; text: string }[]>([])
  const picker = useRef<HTMLInputElement>(null)
  const [search, setSearch] = useState('')
  const [picked, setPicked] = useState<Chip>('all')
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set())

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
  const count = list.files.length
  const chips = chipCounts(list.files)
  // A chip whose last file went away falls back to All rather than hiding every tile.
  const chip = chips.some((entry) => entry.chip === picked) ? picked : 'all'
  const groups = groupAssets(list.files, { chip, search })
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
                project={project}
                open={!collapsed.has(group.folder)}
                onToggle={() => toggle(group.folder)}
              />
            ))
          )}
        </>
      )}
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
    </div>
  )
}

interface GroupProps {
  group: AssetGroup
  project: string
  open: boolean
  onToggle: () => void
}

/** One folder's tiles under a heading that collapses them, `assets/` naming the folder's own files. */
function Group({ group, project, open, onToggle }: GroupProps) {
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
          {group.files.map((file) => (
            <Tile key={file.path} project={project} file={file} />
          ))}
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
