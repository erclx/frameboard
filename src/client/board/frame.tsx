import { Lock, TriangleAlert } from 'lucide-react'
import { memo, useEffect, useMemo, useRef } from 'react'

import { bindKeys } from '@/client/actions/registry'
import { frameTheme, useFrameTheme } from '@/client/theme/store'
import type { Finding } from '@/shared/records/check'
import type { FrameRecord } from '@/shared/records/list'
import { frameThemeUrl, setFrameTheme } from '@/shared/theme'

import { renderedHash } from './frame-dom'
import { usePendingBox } from './geometry/write'
import { useMode } from './mode'
import { select, selectionStore, useSelection } from './selection'

/** The keys a frame's own window hands the board in Play, Esc alone, so the frame's page keeps the rest. */
const PLAY_KEYS = ['Escape']

interface FrameProps {
  frame: FrameRecord
  /** False for a frame far offscreen, which draws a placeholder rather than a live page. */
  live: boolean
  /** Bumped on each reload message, so a changed file reloads this iframe alone. */
  version: number
  /** The frame's check findings, marked on its label when there are any. */
  findings?: readonly Finding[]
}

/**
 * One frame at its box on the canvas layer, with its name above it at a
 * constant screen size. The label is the surface later rows add check
 * findings and claim tags to. In Play a click moves focus into the frame,
 * so Esc is bound into its window to reach the board.
 */
export const Frame = memo(function Frame({
  frame,
  live,
  version,
  findings,
}: FrameProps) {
  // A released move holds its place until the board carries it back.
  const { x, y, width, height } = usePendingBox(frame.ref) ?? frame.box
  const selected = useSelection((state) => state.frames.includes(frame.ref))
  const iframe = useRef<HTMLIFrameElement>(null)
  const playing = useMode((state) => state.mode === 'play')
  const theme = useFrameTheme(frame.ref)
  // Read on each load rather than bound to the effect, so a newer record
  // arriving before the reload stamps the file the iframe then shows.
  const modifiedAt = useRef(frame.modifiedAt)
  useEffect(() => {
    modifiedAt.current = frame.modifiedAt
  }, [frame.modifiedAt])
  // The theme is read when the iframe mounts or reloads, never on a theme
  // change, so a switch rewrites the frame's root below rather than
  // reloading it and restarting its animation and video.
  const src = useMemo(
    () =>
      live ? frameThemeUrl(frame.ref, frameTheme(frame.ref), version) : null,
    [frame.ref, version, live],
  )

  useEffect(() => {
    const element = iframe.current
    if (!live || !element) return
    const write = () => {
      const root = element.contentDocument?.documentElement
      if (root) setFrameTheme(root, theme)
    }
    write()
    element.addEventListener('load', write)
    return () => element.removeEventListener('load', write)
  }, [theme, live])

  // A note's element pick reads which file the iframe rendered, so a pick
  // made after an agent rewrote the frame but before it reloaded is refused.
  useEffect(() => {
    const element = iframe.current
    if (!live || !element) return
    const stamp = () => {
      element.dataset.renderedAt = modifiedAt.current
    }
    element.addEventListener('load', stamp)
    return () => element.removeEventListener('load', stamp)
  }, [live])

  // An element selected in this frame stays only while the frame shows the
  // bytes its index was read from. Any other write may have shifted every
  // index, so the selection drops to the frame rather than outline whatever
  // element took the old one.
  useEffect(() => {
    const element = iframe.current
    if (!live || !element) return
    const check = () => {
      const { page, element: selected } = selectionStore.getState()
      const document = element.contentDocument
      if (selected?.frame !== frame.ref || !page || !document) return
      if (renderedHash(document) !== selected.hash) {
        select(selectionStore, page, [frame.ref])
      }
    }
    element.addEventListener('load', check)
    return () => element.removeEventListener('load', check)
  }, [live, frame.ref])

  useEffect(() => {
    const element = iframe.current
    if (!playing || !element) return
    let unbind = () => {}
    // Each load is a new document, so the binding moves to it and leaves none on the last.
    const bind = () => {
      unbind()
      const target = element.contentWindow
      unbind = target ? bindKeys(target, PLAY_KEYS) : () => {}
    }
    bind()
    element.addEventListener('load', bind)
    return () => {
      element.removeEventListener('load', bind)
      unbind()
    }
  }, [playing, live])

  return (
    <div
      data-frame={frame.ref}
      data-selected={selected || undefined}
      className="absolute"
      style={{ left: x, top: y, width, height, zIndex: frame.order }}
    >
      <div
        className="absolute bottom-full left-0 flex origin-bottom-left items-center gap-1.5 pb-1 text-label text-muted-foreground [transform:scale(calc(1/var(--zoom,1)))]"
        style={{ maxWidth: `calc(${width}px * var(--zoom, 1))` }}
        title={frame.name}
      >
        {frame.locked ? (
          <Lock
            role="img"
            aria-label="Locked"
            className="size-[11px] shrink-0"
            strokeWidth={1.6}
          />
        ) : null}
        <span className="truncate">{frame.name}</span>
        {findings && findings.length > 0 ? (
          <FindingsMark findings={findings} />
        ) : null}
      </div>
      {live ? (
        <iframe
          ref={iframe}
          title={frame.name}
          src={src ?? undefined}
          // The iframe's canvas follows its element's scheme, so a flipped
          // frame with no background of its own paints its own theme's color.
          style={{ colorScheme: theme }}
          className="block size-full border-0 bg-[color:Canvas]"
        />
      ) : (
        <div
          data-placeholder
          className="size-full border border-border bg-card"
        />
      )}
    </div>
  )
})

interface FindingsMarkProps {
  findings: readonly Finding[]
}

/**
 * The count of a frame's check findings beside its name, as a pill tinted in
 * the destructive hue when any finding is an error and the note hue when all
 * are warnings. It never shrinks, so a narrow frame truncates the name and
 * keeps the count.
 */
function FindingsMark({ findings }: FindingsMarkProps) {
  const count = findings.length
  const severity = findings.some((finding) => finding.severity === 'error')
    ? 'error'
    : 'warning'
  return (
    <span
      role="img"
      aria-label={`${count} check finding${count === 1 ? '' : 's'}`}
      title={findings.map((finding) => finding.message).join('\n')}
      data-severity={severity}
      className="flex h-[18px] shrink-0 items-center gap-[3px] rounded-[9px] bg-[color-mix(in_srgb,var(--h)_34%,transparent)] pr-1.5 pl-[5px] font-medium text-[color-mix(in_srgb,var(--h)_55%,var(--foreground))] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--h)_75%,transparent)] data-[severity=error]:[--h:var(--destructive)] data-[severity=warning]:[--h:var(--note)]"
    >
      <TriangleAlert aria-hidden className="size-3 text-[var(--h)]" />
      {count}
    </span>
  )
}
