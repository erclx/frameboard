import { type RefObject, useEffect, useRef, useState } from 'react'
import { useStore } from 'zustand'

import { Popover, PopoverContent } from '@/client/components/ui/popover'
import { useLive } from '@/client/live/store'
import type { AssetAddResult, AssetList } from '@/shared/records/assets'

import { describeAsset } from '../assets/describe'
import { isPlaceable } from '../assets/drag'
import { fetchAssets } from '../assets/list'
import { Thumbnail } from '../assets/tile'
import { uploadAssets } from '../assets/upload'
import { armFile, pickerStore } from './tool'

const CODE = 'font-mono text-label font-normal text-foreground'

interface AssetPickerProps {
  project: string
  /** What the popover opens above, the toolbar in the app. */
  anchor: RefObject<HTMLElement | null>
  /** Reads the project's files, the API in the app. */
  load?: (project: string) => Promise<AssetList | null>
  /** Posts the files Add files picked, the API in the app. */
  upload?: (project: string, files: File[]) => Promise<AssetAddResult>
}

/**
 * The Image tool's picker: the project's images, GIFs, SVGs, and videos as
 * the Assets tab draws its tiles, a choice arming the tool so the next click
 * places that file. It opens while `pickerStore` says so, and never on a
 * read-only tab. With no such file it offers Add files, which posts through
 * the Assets tab's upload.
 */
export function AssetPicker({
  project,
  anchor,
  load = fetchAssets,
  upload = uploadAssets,
}: AssetPickerProps) {
  const canWrite = useLive((state) => state.canWrite)
  const open = useStore(pickerStore, (state) => state.open) && canWrite
  return (
    <Popover
      open={open}
      onOpenChange={(next) => pickerStore.setState({ open: next })}
    >
      <PopoverContent
        anchor={anchor}
        side="top"
        sideOffset={8}
        aria-label="Image or video"
        className="w-[260px] gap-0 p-0 text-xs"
      >
        {open ? (
          <PickerList project={project} load={load} upload={upload} />
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

function PickerList({
  project,
  load,
  upload,
}: Required<Pick<AssetPickerProps, 'project' | 'load' | 'upload'>>) {
  const [reads, setReads] = useState(0)
  const [list, setList] = useState<AssetList | null | undefined>()
  const [busy, setBusy] = useState(false)
  const [refused, setRefused] = useState<string | null>(null)
  const chooser = useRef<HTMLInputElement>(null)

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
  }, [project, load, reads])

  async function add(files: File[]) {
    if (files.length === 0) return
    setBusy(true)
    try {
      const result = await upload(project, files)
      setRefused(
        result.refused.length > 0
          ? result.refused
              .map((entry) => `${entry.name}: ${entry.message}`)
              .join(' ')
          : null,
      )
    } catch (error) {
      setRefused(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
      setReads((count) => count + 1)
    }
  }

  if (list === undefined) return null
  if (list === null) {
    return (
      <p className="m-3 text-muted-foreground">
        The assets did not load. Reload the board to try again.
      </p>
    )
  }
  const files = list.files.filter(isPlaceable)

  return (
    <>
      <h3 className="px-3 pt-2.5 pb-1 text-label text-muted-foreground">
        Image or video · {files.length} {files.length === 1 ? 'file' : 'files'}
      </h3>
      {files.length === 0 ? (
        <div className="flex flex-col items-start gap-2 px-3 pt-1 pb-3">
          <p className="leading-normal text-muted-foreground">
            No images or videos in <code className={CODE}>assets/</code> yet.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => chooser.current?.click()}
            className="h-7 rounded-md bg-primary px-2.5 font-medium text-primary-foreground outline-none hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
          >
            {busy ? 'Adding files…' : 'Add files'}
          </button>
          <input
            ref={chooser}
            type="file"
            multiple
            hidden
            accept="image/*,video/*,.svg"
            aria-label="Choose files to add"
            onChange={(event) => {
              const chosen = [...(event.target.files ?? [])]
              event.target.value = ''
              void add(chosen)
            }}
          />
        </div>
      ) : (
        <ul className="grid max-h-[320px] grid-cols-2 gap-2 overflow-y-auto px-2 pt-1 pb-2">
          {files.map((file) => (
            <li key={file.path}>
              <button
                type="button"
                onClick={() =>
                  armFile({ project, path: file.path, kind: file.kind })
                }
                aria-label={`Place ${file.path}`}
                className="block w-full overflow-hidden rounded-lg bg-muted text-left outline-none hover:ring-[1.5px] hover:ring-primary focus-visible:ring-[1.5px] focus-visible:ring-primary"
              >
                <Thumbnail project={project} file={file} />
                <span className="block truncate px-[7px] py-[5px] text-label font-normal">
                  <span title={file.path}>{file.path}</span>
                  <span className="block text-[10px] text-muted-foreground">
                    {describeAsset(file)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {refused ? (
        <p role="alert" className="mx-3 mb-2 text-destructive">
          {refused}
        </p>
      ) : null}
    </>
  )
}
