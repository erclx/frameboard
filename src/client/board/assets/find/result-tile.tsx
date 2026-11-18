import { useState } from 'react'
import { useStore } from 'zustand'

import { useLive } from '@/client/live/store'

import { type ImageResult, saveKey, saveStore } from '../sourcing'

interface ResultTileProps {
  project: string
  result: ImageResult
  /** Saves the result into `assets/`, sharing one save with a drag of the same result. */
  onSave: () => void
}

/**
 * One found image, its license on the thumbnail. Save shows under hover or
 * focus and stays as Saved once the file lands, so the grid never jumps.
 */
export function ResultTile({ project, result, onSave }: ResultTileProps) {
  const canWrite = useLive((state) => state.canWrite)
  const save = useStore(
    saveStore,
    (state) => state[saveKey(project, result.id)],
  )
  const title = result.title ?? result.id
  const meta = [sizeOf(result), siteName(result.landingUrl)]
    .filter(Boolean)
    .join(' · ')
  const shown = save !== undefined && save.state !== 'failed'

  return (
    <li className="group relative overflow-hidden rounded-lg bg-muted hover:ring-[1.5px] hover:ring-primary has-focus-visible:ring-[1.5px] has-focus-visible:ring-primary">
      <Thumbnail url={thumbnailOf(result)} />
      <span className="absolute top-[54px] left-[5px] rounded-[3px] bg-black/65 px-1 font-mono text-[9px] leading-[14px] font-medium text-white">
        {result.license}
      </span>
      {canWrite ? (
        <button
          type="button"
          aria-label={`${PILL[save?.state ?? 'idle']} ${title}`}
          disabled={save?.state === 'saving' || save?.state === 'saved'}
          onClick={onSave}
          className={`absolute top-[5px] right-[5px] rounded-[5px] bg-card px-1.5 py-0.5 text-[10px] text-foreground shadow-[0_1px_3px_rgba(0,0,0,.3)] outline-none group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-3 focus-visible:ring-ring/50 ${shown ? '' : 'opacity-0'}`}
        >
          {PILL[save?.state ?? 'idle']}
        </button>
      ) : null}
      <span className="block truncate px-[7px] py-[5px] text-label font-normal">
        {title}
        <span className="block text-[10px] text-muted-foreground">{meta}</span>
      </span>
    </li>
  )
}

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
  for (const candidate of [result.thumbnail, result.url]) {
    if (candidate === null) continue
    try {
      const { protocol } = new URL(candidate)
      if (protocol === 'https:' || protocol === 'http:') return candidate
    } catch {
      // A malformed URL falls through to the next candidate.
    }
  }
  return null
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
