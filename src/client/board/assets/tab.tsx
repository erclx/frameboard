import { Plus } from 'lucide-react'
import { type DragEvent, useEffect, useRef, useState } from 'react'

import { useLive } from '@/client/live/store'
import type { AssetAddResult, AssetList } from '@/shared/records/assets'

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
 * as tiles, a click copying the path a frame links one by, and a drop or the
 * header's picker adding files. It reads the list again on every board
 * message while open, so a file an agent wrote shows without a reload.
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
        <ul className="grid grid-cols-2 gap-2 px-2 py-1">
          {list.files.map((file) => (
            <Tile key={file.path} project={project} file={file} />
          ))}
        </ul>
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

async function fetchAssets(project: string): Promise<AssetList | null> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(project)}/assets`,
  )
  const body = (await response.json()) as AssetsBody
  return body.ok ? body.data : null
}

type AssetsBody = { ok: true; data: AssetList } | { ok: false }
