import { draggable } from '@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter'
import { Box, Music, Play } from 'lucide-react'
import { type RefObject, useEffect, useRef, useState } from 'react'

import {
  AssetMenu,
  type AssetMenuActs,
  AssetMore,
} from '@/client/board/menus/asset'
import { RenameField } from '@/client/components/rename-field'
import {
  Popover,
  PopoverContent,
  PopoverTitle,
} from '@/client/components/ui/popover'
import { useLive } from '@/client/live/store'
import { jumpToFrame } from '@/client/palette/targets'
import { isPlaceableKind } from '@/shared/asset-kinds'
import type { AssetFile } from '@/shared/records/assets'

import {
  assetUrl,
  describeAsset,
  describeUsage,
  formatLength,
  frameLabel,
  kindLabel,
  linkPath,
  stemOf,
  tileLabel,
} from './describe'
import { tileDragData } from './drag'
import { fileName } from './groups'

/** What a tile's menu does, Delete handed the tile's button to give focus back to. */
export interface TileActs extends Omit<AssetMenuActs, 'copy' | 'remove'> {
  remove?: (tile: HTMLElement | null) => void
}

interface TileProps {
  project: string
  file: AssetFile
  /** Bumped by a replace, so the thumbnail loads the new bytes from the same path. */
  version?: number
  /** The menu's writes, each absent where the tile cannot make it. */
  acts?: TileActs
  /** Reads the refs of the frames linking the file, for Show frames using it. */
  loadFrames?: () => Promise<string[]>
  /** Set while the name shows as the rename field, saving the stem it is given with the extension kept. */
  rename?: { commit: (name: string) => void; cancel: () => void }
}

type Copy = 'idle' | 'copied' | 'failed'

const COPIED_MS = 1500

/**
 * One asset tile, its size kept in the accessible name. A click copies the
 * path a frame links it by, media drags onto a frame while the tab writes,
 * and a right-click or the corner's ⋯ opens the tile's menu.
 */
export function Tile({
  project,
  file,
  version = 0,
  acts: { remove, ...acts } = {},
  loadFrames,
  rename,
}: TileProps) {
  const [copy, setCopy] = useState<Copy>('idle')
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const button = useRef<HTMLButtonElement>(null)
  const item = useRef<HTMLLIElement>(null)
  const [active, setActive] = useState(false)
  const [listing, setListing] = useState<FramesListing | null>(null)
  const canWrite = useLive((state) => state.canWrite)
  const { path, kind } = file
  const usage = describeUsage(file)
  useEffect(() => {
    const element = button.current
    if (!element || !canWrite) return
    if (!isPlaceableKind(kind)) return
    return draggable({
      element,
      getInitialData: () => tileDragData({ project, path, kind }),
    })
  }, [project, path, kind, canWrite, rename])

  function showFrames() {
    if (!loadFrames) return
    setListing({ state: 'loading' })
    loadFrames().then(
      (refs) => setListing({ state: 'ready', refs }),
      () => setListing({ state: 'failed' }),
    )
  }

  const menuActs: AssetMenuActs = {
    ...acts,
    copy: () => void copyPath(),
    showFrames: loadFrames ? showFrames : undefined,
    remove: remove ? () => remove(button.current) : undefined,
  }
  // The size moves the address on both sides of a replace's undo, which a counter alone would leave cached.
  const url = `${assetUrl(project, path)}${version > 0 ? `?v=${file.size}-${version}` : ''}`

  async function copyPath() {
    let next: Copy = 'copied'
    try {
      await navigator.clipboard.writeText(linkPath(file.path))
    } catch {
      next = 'failed'
    }
    setCopy(next)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopy('idle'), COPIED_MS)
  }

  const caption = (
    <span className="block text-[10px] text-muted-foreground">
      {usage === null ? (
        describeAsset(file)
      ) : (
        <>
          {kindLabel(kind)} ·{' '}
          <span className={file.frames === 0 ? UNUSED : undefined}>
            {usage}
          </span>
        </>
      )}
    </span>
  )

  if (rename) {
    const { stem, extension } = stemOf(fileName(path))
    return (
      <li className="overflow-hidden rounded-lg bg-muted ring-[1.5px] ring-primary">
        <Thumbnail project={project} file={file} url={url} />
        <span className="block px-[7px] py-[5px] text-label font-normal">
          <span className="flex min-w-0 items-center">
            <RenameField
              hug
              name={stem}
              label={`Rename ${path}`}
              onCommit={(next) => rename.commit(`${next}${extension}`)}
              onCancel={rename.cancel}
            />
            <span className="shrink-0 pl-1 text-muted-foreground">
              {extension}
            </span>
          </span>
          {caption}
        </span>
      </li>
    )
  }

  return (
    <li ref={item} className="group/tile relative">
      <AssetMenu
        acts={menuActs}
        frames={file.frames}
        canWrite={canWrite}
        trigger={
          <button
            ref={button}
            type="button"
            onClick={() => void copyPath()}
            onPointerEnter={() => setActive(true)}
            onPointerLeave={() => setActive(false)}
            onFocus={() => setActive(true)}
            onBlur={() => setActive(false)}
            aria-label={tileLabel(file)}
            className="group relative block w-full overflow-hidden rounded-lg bg-muted text-left outline-none group-has-[[data-popup-open]]/tile:ring-[1.5px] group-has-[[data-popup-open]]/tile:ring-primary hover:ring-[1.5px] hover:ring-primary focus-visible:ring-[1.5px] focus-visible:ring-primary data-[popup-open]:ring-[1.5px] data-[popup-open]:ring-primary"
          >
            <Thumbnail
              project={project}
              file={file}
              playing={active}
              url={url}
            />
            <span
              aria-live="polite"
              className={`absolute top-[5px] rounded-[5px] bg-card px-1.5 py-0.5 text-[10px] text-foreground shadow-[0_1px_3px_rgba(0,0,0,.3)] ${canWrite ? 'right-[30px]' : 'right-[5px] group-hover:visible group-focus-visible:visible'} ${copy === 'idle' ? 'invisible' : ''}`}
            >
              {PILL[copy]}
            </span>
            <span className="block truncate px-[7px] py-[5px] text-label font-normal">
              <span title={file.path}>{fileName(file.path)}</span>
              {caption}
            </span>
          </button>
        }
      />
      {canWrite ? (
        <AssetMore
          path={path}
          acts={menuActs}
          frames={file.frames}
          tile={button}
          className="invisible absolute top-[5px] right-[5px] grid size-5 place-items-center rounded-[5px] bg-card text-foreground shadow-[0_1px_3px_rgba(0,0,0,.3)] outline-none group-focus-within/tile:visible group-hover/tile:visible hover:bg-accent focus-visible:ring-[1.5px] focus-visible:ring-primary data-[popup-open]:visible"
        />
      ) : null}
      <FramesPopover
        anchor={item}
        tile={button}
        listing={listing}
        onClose={() => setListing(null)}
      />
    </li>
  )
}

type FramesListing =
  | { state: 'loading' }
  | { state: 'ready'; refs: string[] }
  | { state: 'failed' }

/**
 * The frames linking the file, opened from Show frames using it, a click on
 * one jumping the canvas to it.
 */
function FramesPopover({
  anchor,
  tile,
  listing,
  onClose,
}: {
  anchor: RefObject<HTMLElement | null>
  /** The tile's own button, which takes focus back when the popover closes. */
  tile: RefObject<HTMLElement | null>
  listing: FramesListing | null
  onClose: () => void
}) {
  return (
    <Popover
      open={listing !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <PopoverContent
        anchor={anchor}
        side="right"
        align="start"
        finalFocus={tile}
        className="w-52 gap-1 p-1 text-label"
      >
        <PopoverTitle className="px-2 pt-1 pb-0.5 text-[10px] font-normal text-muted-foreground">
          Frames using it
        </PopoverTitle>
        {listing?.state === 'loading' ? (
          <p className="px-2 py-1 text-muted-foreground">Reading frames…</p>
        ) : listing?.state === 'failed' ? (
          <p className="px-2 py-1 text-destructive">
            The frames did not load. Try again.
          </p>
        ) : listing?.state === 'ready' && listing.refs.length === 0 ? (
          <p className="px-2 py-1 text-muted-foreground">No frames use it.</p>
        ) : (
          <ul>
            {listing?.state === 'ready'
              ? listing.refs.map((ref) => (
                  <li key={ref}>
                    <button
                      type="button"
                      onClick={() => {
                        onClose()
                        jumpToFrame(ref)
                      }}
                      className="flex h-7 w-full items-center rounded-md px-2 text-left outline-none hover:bg-accent focus-visible:bg-accent"
                    >
                      <span className="truncate">{frameLabel(ref)}</span>
                    </button>
                  </li>
                ))
              : null}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}

/**
 * The note hue pulled a third toward the foreground, since the note color
 * itself reads under 4.5:1 as 10px text on the light tile.
 */
const UNUSED = 'text-[color-mix(in_oklab,var(--note)_70%,var(--foreground))]'

const PILL: Record<Copy, string> = {
  idle: 'Copy path',
  copied: 'Copied',
  failed: 'Copy failed',
}

const THUMB = 'grid h-[72px] place-items-center text-muted-foreground'

interface ThumbnailProps {
  project: string
  file: AssetFile
  /** Whether its tile is hovered or focused, which plays a video muted. */
  playing?: boolean
  /** Where the file loads from, the board's asset route by default. */
  url?: string
}

/** A file's 72px preview, the image itself, a video's first frame, or a mark for its kind. */
export function Thumbnail({
  project,
  file,
  playing = false,
  url = assetUrl(project, file.path),
}: ThumbnailProps) {
  switch (file.kind) {
    case 'image':
    case 'gif':
    case 'svg':
      return (
        <span className={THUMB}>
          <img
            src={url}
            alt=""
            loading="lazy"
            decoding="async"
            draggable={false}
            className="h-[72px] w-full object-cover"
          />
        </span>
      )
    case 'video':
      return <VideoThumbnail url={url} playing={playing} />
    case 'audio':
      return (
        <span className={THUMB}>
          <Music aria-hidden className="size-4" />
        </span>
      )
    case 'model':
      return (
        <span className={THUMB}>
          <Box aria-hidden className="size-[22px]" strokeWidth={1.6} />
        </span>
      )
    case 'font':
      return <span className={`${THUMB} text-[26px] text-foreground`}>Aa</span>
    default:
      return <span className={`${THUMB} font-mono`}>{'{ }'}</span>
  }
}

type Media =
  | { state: 'loading' }
  | { state: 'ready'; length: number }
  | { state: 'unplayable' }

/**
 * A video's first frame, preloading metadata alone so a tab of videos loads
 * little, and naming a codec it cannot decode in place of a black box.
 */
function VideoThumbnail({ url, playing }: { url: string; playing: boolean }) {
  const video = useRef<HTMLVideoElement>(null)
  const [media, setMedia] = useState<Media>({ state: 'loading' })
  const ready = media.state === 'ready'
  useEffect(() => {
    const element = video.current
    if (!element || !ready) return
    if (playing) {
      // A play the browser refuses leaves the first frame showing, which is the idle tile.
      element.play().catch(() => undefined)
      return
    }
    element.pause()
    element.currentTime = 0
  }, [playing, ready])

  if (media.state === 'unplayable') {
    return (
      <span
        data-video-unplayable
        className={`${THUMB} bg-[#111] px-2 text-center text-[10px] text-white`}
      >
        Can't play this codec
      </span>
    )
  }
  return (
    <span className={`${THUMB} relative bg-[#111] text-white`}>
      <video
        ref={video}
        src={url}
        preload="metadata"
        muted
        loop
        playsInline
        aria-hidden
        draggable={false}
        onLoadedMetadata={(event) => {
          const { videoWidth, duration } = event.currentTarget
          setMedia(
            videoWidth > 0
              ? { state: 'ready', length: duration }
              : { state: 'unplayable' },
          )
        }}
        onError={() => setMedia({ state: 'unplayable' })}
        className="h-[72px] w-full object-cover"
      />
      {ready ? (
        <span
          data-video-length
          className="absolute right-1 bottom-1 rounded-[3px] bg-black/65 px-[3px] font-mono text-[9px] font-medium text-white"
        >
          {formatLength(media.length)}
        </span>
      ) : (
        <Play aria-hidden className="absolute size-4" />
      )}
    </span>
  )
}
