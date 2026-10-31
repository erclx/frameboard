import { draggable } from '@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter'
import { Music, Play } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { useLive } from '@/client/live/store'
import { isPlaceableKind } from '@/shared/asset-kinds'
import type { AssetFile } from '@/shared/records/assets'

import {
  assetUrl,
  describeAsset,
  describeUsage,
  formatSize,
  kindLabel,
  linkPath,
} from './describe'
import { tileDragData } from './drag'
import { fileName } from './groups'

interface TileProps {
  project: string
  file: AssetFile
}

type Copy = 'idle' | 'copied' | 'failed'

const COPIED_MS = 1500

/**
 * One file of `canon/design/tabs/assets`: the thumbnail, the name inside its
 * folder, and the `<type> · <frames>` line, `Unused` in the note color for a
 * file no frame links, with the size kept in the accessible name. A listing
 * with no counts keeps the `<type> · <size>` line. A click copies the path a
 * frame links it by. An
 * image, GIF, SVG, or video drags onto a frame while this tab may write,
 * landing where the canvas's drop target places it.
 */
export function Tile({ project, file }: TileProps) {
  const [copy, setCopy] = useState<Copy>('idle')
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const button = useRef<HTMLButtonElement>(null)
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
  }, [project, path, kind, canWrite])

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

  return (
    <li>
      <button
        ref={button}
        type="button"
        onClick={() => void copyPath()}
        aria-label={`Copy path of ${[file.path, kindLabel(kind), formatSize(file.size), usage].filter(Boolean).join(', ')}`}
        className="group relative block w-full overflow-hidden rounded-lg bg-muted text-left outline-none hover:ring-[1.5px] hover:ring-primary focus-visible:ring-[1.5px] focus-visible:ring-primary"
      >
        <Thumbnail project={project} file={file} />
        <span
          aria-live="polite"
          className={`absolute top-[5px] right-[5px] rounded-[5px] bg-card px-1.5 py-0.5 text-[10px] text-foreground shadow-[0_1px_3px_rgba(0,0,0,.3)] group-hover:visible group-focus-visible:visible ${copy === 'idle' ? 'invisible' : ''}`}
        >
          {PILL[copy]}
        </span>
        <span className="block truncate px-[7px] py-[5px] text-label font-normal">
          <span title={file.path}>{fileName(file.path)}</span>
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
        </span>
      </button>
    </li>
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

/** A file's 72px preview, the image itself or a mark for its kind. */
export function Thumbnail({ project, file }: TileProps) {
  switch (file.kind) {
    case 'image':
    case 'gif':
    case 'svg':
      return (
        <span className={THUMB}>
          <img
            src={assetUrl(project, file.path)}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-[72px] w-full object-cover"
          />
        </span>
      )
    case 'video':
      return (
        <span className={`${THUMB} bg-[#111] text-white`}>
          <Play aria-hidden className="size-4" />
        </span>
      )
    case 'audio':
      return (
        <span className={THUMB}>
          <Music aria-hidden className="size-4" />
        </span>
      )
    case 'font':
      return <span className={`${THUMB} text-[26px] text-foreground`}>Aa</span>
    default:
      return <span className={`${THUMB} font-mono`}>{'{ }'}</span>
  }
}
