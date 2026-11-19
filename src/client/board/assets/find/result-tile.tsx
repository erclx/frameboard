import { draggable } from '@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter'
import { type RefObject, useEffect, useRef, useState } from 'react'
import { useStore } from 'zustand'

import { useLive } from '@/client/live/store'
import { folderName } from '@/shared/names'

import { resultDragData } from '../drag'
import {
  type ImageResult,
  type ModelResult,
  saveKey,
  type SaveState,
  saveStore,
} from '../sourcing'

interface ResultTileProps {
  project: string
  result: ImageResult
  /** The search that found it, which names the saved file. */
  query: string
  credited: boolean
  /** Saves the result into `assets/`, sharing one save with a drag of the same result. */
  onSave: () => void
}

/** One found image, its second line its size and the site it came from. */
export function ResultTile({
  project,
  result,
  query,
  credited,
  onSave,
}: ResultTileProps) {
  const canWrite = useLive((state) => state.canWrite)
  const tile = useRef<HTMLLIElement>(null)
  const { id, width, height } = result
  useEffect(() => {
    const element = tile.current
    if (!element || !canWrite) return
    return draggable({
      element,
      getInitialData: () =>
        resultDragData({
          request: { project, result: { id }, query, credited },
          name: folderName(query) || 'image',
          natural: width === null || height === null ? null : { width, height },
        }),
    })
  }, [project, id, width, height, query, credited, canWrite])
  const save = useStore(
    saveStore,
    (state) => state[saveKey(project, result.id)],
  )
  const meta = [sizeOf(result), siteName(result.landingUrl)]
    .filter(Boolean)
    .join(' · ')
  return (
    <TileBody
      tile={tile}
      thumbnail={thumbnailOf(result)}
      license={result.license}
      title={result.title ?? result.id}
      meta={meta}
      save={canWrite ? save : null}
      onSave={onSave}
    />
  )
}

interface TileBodyProps {
  tile: RefObject<HTMLLIElement | null>
  thumbnail: string | null
  license: string
  title: string
  meta: string
  /** The result's save, null in a read-only tab, which draws no Save. */
  save: SaveState | undefined | null
  onSave: () => void
}

/**
 * A found result's tile, its license on the thumbnail. Save shows under hover
 * or focus and stays as Saved once the file lands, so the grid never jumps.
 */
function TileBody({
  tile,
  thumbnail,
  license,
  title,
  meta,
  save,
  onSave,
}: TileBodyProps) {
  const shown = save !== null && save !== undefined && save.state !== 'failed'
  return (
    <li
      ref={tile}
      className="group relative overflow-hidden rounded-lg bg-muted hover:ring-[1.5px] hover:ring-primary has-focus-visible:ring-[1.5px] has-focus-visible:ring-primary"
    >
      <Thumbnail url={thumbnail} />
      <span className="absolute top-[54px] left-[5px] rounded-[3px] bg-black/65 px-1 font-mono text-[9px] leading-[14px] font-medium text-white">
        {license}
      </span>
      {save !== null ? (
        <button
          type="button"
          aria-label={`${PILL[save?.state ?? 'idle']} ${title}`}
          disabled={save?.state === 'saving'}
          onClick={onSave}
          className={`absolute top-[5px] right-[5px] rounded-[5px] bg-card px-1.5 py-0.5 text-[10px] text-foreground shadow-[0_1px_3px_rgba(0,0,0,.3)] outline-none group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/50 ${shown ? '' : 'opacity-0'}`}
        >
          {PILL[save?.state ?? 'idle']}
        </button>
      ) : null}
      <span className="block truncate px-[7px] py-[5px] text-label font-normal">
        {title}
        <span
          title={meta}
          className="block truncate text-[10px] text-muted-foreground"
        >
          {meta}
        </span>
      </span>
    </li>
  )
}

interface ModelTileProps {
  project: string
  result: ModelResult
  /** The search that found it, which names the saved file. */
  query: string
  /** Saves the model into `assets/` as one GLB, sharing one save with a drag of it. */
  onSave: () => void
}

/**
 * One found Poly Haven model, drawn as an image result is, its second line
 * the polycount and Poly Haven, which every listing of its models names.
 */
export function ModelTile({ project, result, query, onSave }: ModelTileProps) {
  const canWrite = useLive((state) => state.canWrite)
  const tile = useRef<HTMLLIElement>(null)
  const { id } = result
  useEffect(() => {
    const element = tile.current
    if (!element || !canWrite) return
    return draggable({
      element,
      getInitialData: () =>
        resultDragData({
          request: {
            project,
            result: { id },
            query,
            credited: false,
            kind: 'model',
          },
          name: folderName(query) || 'model',
          natural: null,
        }),
    })
  }, [project, id, query, canWrite])
  const save = useStore(
    saveStore,
    (state) => state[saveKey(project, id, 'model')],
  )
  const meta = [trianglesOf(result.polycount), POLYHAVEN].filter(Boolean)
  return (
    <TileBody
      tile={tile}
      thumbnail={httpOnly(result.thumbnail)}
      license={result.license}
      title={result.name}
      meta={meta.join(' · ')}
      save={canWrite ? save : null}
      onSave={onSave}
    />
  )
}

const POLYHAVEN = 'Poly Haven'

const PILL = {
  idle: 'Save',
  saving: 'Saving…',
  saved: 'Saved',
  failed: 'Save again',
} as const

/** The 72px preview straight from the source, a grey block when it has none or fails to load. */
function Thumbnail({ url }: { url: string | null }) {
  const [failed, setFailed] = useState(false)
  return (
    <span className="block h-[72px] bg-muted">
      {url === null || failed ? null : (
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          draggable={false}
          onError={() => setFailed(true)}
          className="h-[72px] w-full object-cover"
        />
      )}
    </span>
  )
}

/** The source's thumbnail, else the image itself, and only over http or https. */
function thumbnailOf(
  result: Pick<ImageResult, 'thumbnail' | 'url'>,
): string | null {
  return httpOnly(result.thumbnail) ?? httpOnly(result.url)
}

function httpOnly(candidate: string | null): string | null {
  if (candidate === null) return null
  try {
    const { protocol } = new URL(candidate)
    return protocol === 'https:' || protocol === 'http:' ? candidate : null
  } catch {
    return null
  }
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

function sizeOf({
  width,
  height,
}: Pick<ImageResult, 'width' | 'height'>): string | null {
  return width === null || height === null ? null : `${width} × ${height}`
}

/**
 * The site a result came from, read off its landing page as the label under
 * its top-level domain, so `www.flickr.com` reads Flickr.
 */
function siteName(landingUrl: string | null): string | null {
  if (landingUrl === null) return null
  let host: string
  try {
    host = new URL(landingUrl).hostname
  } catch {
    return null
  }
  const labels = host.split('.')
  const name = labels.at(-2) ?? labels[0] ?? ''
  return name === '' ? null : name[0]?.toUpperCase() + name.slice(1)
}
