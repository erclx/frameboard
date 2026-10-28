import { cn } from 'cn'
import { Lock, Moon, MoveHorizontal, Sun, TriangleAlert } from 'lucide-react'
import { memo, useEffect, useMemo, useRef, useState } from 'react'

import { bindKeys } from '@/client/actions/registry'
import { RenameField } from '@/client/components/rename-field'
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from '@/client/components/ui/popover'
import { type Structure, structure } from '@/client/live/structure'
import { useUnseen } from '@/client/live/unseen'
import {
  flipFrame,
  frameTheme,
  useFrameTheme,
  useShownTheme,
} from '@/client/theme/store'
import type { Finding } from '@/shared/records/check'
import type { Claim } from '@/shared/records/claims'
import type { FrameRecord } from '@/shared/records/list'
import { frameThemeUrl, setFrameTheme, type Theme } from '@/shared/theme'

import { useCompare } from './changes/compare'
import { CompareControl, CompareView } from './changes/compare-view'
import { UnseenDot } from './changes/dot'
import { ClaimTag } from './claims/tag'
import { FindingsList } from './findings-list'
import { openFindings, useFindingsOpen } from './findings-open'
import { renderedHash } from './frame-dom'
import { useDrawnBox, usePendingBox } from './geometry/write'
import { useMode } from './mode'
import { measureHeight } from './preview/height'
import { measurePreview, usePreview } from './preview/store'
import { awaitingHash, select, selectionStore, useSelection } from './selection'
import {
  renameFrame,
  stopFrameRename,
  useRenamingFrame,
} from './structure/actions'

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
  /** The session holding the frame, drawn as a dashed outline and a tag in Edit. */
  claim?: Claim
  /** An agent changed the frame since the developer last looked. */
  unseen?: boolean
}

/**
 * One frame at its box on the canvas layer, with its name above it at a
 * constant screen size. The label is the surface later rows add check
 * findings, claim tags, and the theme marker to. In Play a click moves focus
 * into the frame, so Esc is bound into its window to reach the board.
 */
export const Frame = memo(function Frame({
  frame,
  live,
  version,
  findings,
  claim,
  unseen = false,
}: FrameProps) {
  // A released move holds its place until the board carries it back, and a
  // preview draws its width without touching either box.
  const { x, y, width, height } = useDrawnBox(frame)
  const storedWidth = (usePendingBox(frame.ref) ?? frame.box).width
  const preview = usePreview(frame.ref)
  const renaming = useRenamingFrame('canvas') === frame.ref
  const selected = useSelection((state) => state.frames.includes(frame.ref))
  const iframe = useRef<HTMLIFrameElement>(null)
  const playing = useMode((state) => state.mode === 'play')
  const theme = useFrameTheme(frame.ref)
  const findingsOpen = useFindingsOpen(frame.ref)
  const hasBase = useUnseen((state) => frame.ref in state.base)
  const compared = useCompare((state) =>
    state.ref === frame.ref ? state.hash : null,
  )
  // Read on each load rather than bound to the effect, so a newer record
  // arriving before the reload stamps the file the iframe then shows.
  const modifiedAt = useRef(frame.modifiedAt)
  useEffect(() => {
    modifiedAt.current = frame.modifiedAt
  }, [frame.modifiedAt])
  // The ref is taken when the iframe mounts, reloads, or comes live, never on
  // a rename alone, which moves the file the iframe already shows. A reload
  // after one asks for the new path.
  const [loaded, setLoaded] = useState({ ref: frame.ref, version, live })
  if (loaded.version !== version || loaded.live !== live) {
    setLoaded({ ref: frame.ref, version, live })
  }
  // The theme is read when the iframe mounts or reloads, never on a theme
  // change, so a switch rewrites the frame's root below rather than
  // reloading it and restarting its animation and video.
  const src = useMemo(
    () =>
      loaded.live
        ? frameThemeUrl(loaded.ref, frameTheme(loaded.ref), loaded.version)
        : null,
    [loaded],
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
  // element took the old one. Bytes the board's own writes left the frame at
  // are kept, as is any reload while such a write is in flight, since the
  // reload of the bytes the selection names is still to come.
  useEffect(() => {
    const element = iframe.current
    if (!live || !element) return
    const check = () => {
      const { page, element: selected } = selectionStore.getState()
      const document = element.contentDocument
      if (selected?.frame !== frame.ref || !page || !document) return
      const shown = renderedHash(document)
      if (shown === selected.hash || awaitingHash(frame.ref, shown)) return
      select(selectionStore, page, [frame.ref])
    }
    element.addEventListener('load', check)
    return () => element.removeEventListener('load', check)
  }, [live, frame.ref])

  // A previewed frame hugging its height takes its content's height at the
  // previewed width, read again on each load, as an agent's write reloads it.
  const previewWidth = preview?.width
  const { hugHeight, box } = frame
  useEffect(() => {
    const element = iframe.current
    if (!live || !element || previewWidth === undefined || !hugHeight) return
    const measure = () =>
      measurePreview(
        frame.ref,
        previewWidth,
        measureHeight(element, box.height),
      )
    measure()
    element.addEventListener('load', measure)
    return () => element.removeEventListener('load', measure)
  }, [live, previewWidth, hugHeight, frame.ref, box.height])

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

  // Play shows the frames as they ship, so a claim draws nothing there.
  const claimed = claim && !playing ? claim : undefined

  return (
    <div
      data-frame={frame.ref}
      data-selected={selected || undefined}
      data-claimed={claimed ? true : undefined}
      data-findings-open={findingsOpen || undefined}
      className="absolute"
      style={{ left: x, top: y, width, height, zIndex: frame.order }}
    >
      <div
        className={cn(
          'absolute bottom-full left-0 flex origin-bottom-left items-center gap-1.5 pb-1 text-label [transform:scale(calc(1/var(--zoom,1)))]',
          // Hidden while the canvas marks the frame crowded, its room above
          // shorter than the label at this zoom, unless the pointer is over
          // it, it is selected, or its findings are open.
          '[[data-label-crowded]:not([data-label-hover]):not([data-selected]):not([data-findings-open])>&]:hidden',
          claimed ? 'text-claim' : 'text-muted-foreground',
          // `LabelRename` draws the field over it.
          renaming && 'invisible',
        )}
        // A preview narrower than the stored box leaves that box's room above
        // it, so the name and the Preview chip may use it.
        style={{
          maxWidth: `calc(${Math.max(width, storedWidth)}px * var(--zoom, 1))`,
        }}
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
        {/* The claim's tag stands in for the mark while it lives. */}
        {unseen && !claim ? <UnseenDot /> : null}
        <span
          className={cn('truncate', (preview || claimed) && 'shrink-[1000]')}
        >
          {frame.name}
        </span>
        {preview ? <PreviewChip width={preview.width} /> : null}
        {playing ? null : (
          <ThemeMarker frameRef={frame.ref} name={frame.name} theme={theme} />
        )}
        {hasBase && !playing ? (
          <CompareControl frameRef={frame.ref} name={frame.name} />
        ) : null}
        {claimed ? <ClaimTag claim={claimed} /> : null}
        {findings && findings.length > 0 ? (
          <FindingsMark frame={frame} findings={findings} />
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
      {live && compared && !playing ? (
        <CompareView frameRef={frame.ref} name={frame.name} hash={compared} />
      ) : null}
      {claimed ? <ClaimOutline /> : null}
      {findings && findings.length > 0 ? (
        <span
          aria-hidden
          data-findings-dot
          data-findings-badge={frame.ref}
          data-severity={severityOf(findings)}
          className={cn(
            'absolute top-0 left-0 hidden size-2.5 rounded-full shadow-[0_0_0_2px_var(--background)] [transform:translate(-50%,-50%)_scale(calc(1/var(--zoom,1)))] data-[severity=error]:bg-destructive data-[severity=warning]:bg-note',
            // Shown exactly while the label hides, by the label's own rule,
            // on the top left where the label starts, since a frame note
            // takes the top right.
            '[[data-label-crowded]:not([data-label-hover]):not([data-selected]):not([data-findings-open])>&]:block',
          )}
        />
      ) : null}
    </div>
  )
})

interface LabelRenameProps {
  /** The page's shown frames, which the renamed frame is found among. */
  frames: readonly FrameRecord[]
  /** The server calls the rename writes through, the board's own when absent. */
  calls?: Structure
}

/**
 * The rename field a frame's label opens, drawn over the label it hides at
 * the label's constant screen size. It mounts above the hit layer rather
 * than in the label, so a click inside it places the caret instead of
 * pressing the canvas. Its width follows the frame's within a readable range.
 */
export function LabelRename({ frames, calls = structure }: LabelRenameProps) {
  const ref = useRenamingFrame('canvas')
  const frame = frames.find((candidate) => candidate.ref === ref)
  if (!frame) return null
  return <LabelRenameAt frame={frame} calls={calls} />
}

function LabelRenameAt({
  frame,
  calls,
}: {
  frame: FrameRecord
  calls: Structure
}) {
  const { x, y, width } = useDrawnBox(frame)
  return (
    <div className="absolute" style={{ left: x, top: y }}>
      <div
        // The right padding gives back the field's -ml-1.5, so a long name stops at the cap exactly.
        className="pointer-events-auto absolute bottom-0 left-0 flex w-max origin-bottom-left pr-1.5 pb-0.5 text-label [transform:scale(calc(1/var(--zoom,1)))]"
        style={{
          maxWidth: `clamp(160px, calc(${width}px * var(--zoom, 1)), 240px)`,
        }}
      >
        <RenameField
          hug
          name={frame.name}
          label={`Rename frame ${frame.name}`}
          onCommit={(name) => {
            stopFrameRename()
            void renameFrame(frame, name, calls)
          }}
          onCancel={stopFrameRename}
        />
      </div>
    </div>
  )
}

/**
 * The frame's theme on its label: a sun while it follows the board, shown
 * only while the pointer is over the frame as `canon/design/canvas/labels`
 * draws it, and a Dark or Light chip while it is flipped alone, so a flipped
 * frame never reads as a theme bug. A click flips it, reaching the button through the
 * hit layer as the compare control does. It gives way before the findings
 * count on a narrow frame, which matters more.
 */
function ThemeMarker({
  frameRef,
  name,
  theme,
}: {
  frameRef: string
  name: string
  theme: Theme
}) {
  const board = useShownTheme()
  const to = theme === 'dark' ? 'light' : 'dark'
  const label = `Flip ${name} to ${to}`
  if (theme === board) {
    return (
      <button
        type="button"
        data-label-control
        aria-label={label}
        title={label}
        onClick={() => flipFrame(frameRef)}
        className="invisible grid h-[18px] w-[18px] min-w-0 shrink place-items-center overflow-hidden rounded-[5px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 [[data-label-hover]_&]:visible"
      >
        <Sun aria-hidden className="size-3" />
      </button>
    )
  }
  const Icon = theme === 'dark' ? Moon : Sun
  return (
    <button
      type="button"
      data-label-control
      aria-label={label}
      title={label}
      onClick={() => flipFrame(frameRef)}
      className="flex h-[18px] min-w-0 shrink items-center gap-1 overflow-hidden rounded-[5px] bg-[color-mix(in_srgb,var(--foreground)_14%,transparent)] px-[5px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <Icon aria-hidden className="size-3" />
      {theme === 'dark' ? 'Dark' : 'Light'}
    </button>
  )
}

/**
 * The width a frame is previewed at, beside its name. It reads as a preview
 * rather than a size, since the frame's stored box is unchanged. A narrow
 * label truncates the name first, which shrinks far faster beside it, then
 * ends the chip in an ellipsis, so a clipped width never reads as a different
 * number and the chip stays inside the label.
 */
function PreviewChip({ width }: { width: number }) {
  return (
    <span
      data-preview-chip
      title={`Previewed at ${width} px wide. The frame's size is unchanged.`}
      className="flex h-[18px] min-w-0 shrink items-center gap-1 overflow-hidden rounded-[5px] bg-[color-mix(in_srgb,var(--foreground)_14%,transparent)] px-[5px] text-foreground"
    >
      <MoveHorizontal aria-hidden className="size-3 shrink-0" />
      <span className="truncate">Preview {width}</span>
    </span>
  )
}

function severityOf(findings: readonly Finding[]): Finding['severity'] {
  return findings.some((finding) => finding.severity === 'error')
    ? 'error'
    : 'warning'
}

/**
 * The claimed frame's dashed outline, 1.5px wide and 3px outside it on
 * screen at any zoom.
 */
function ClaimOutline() {
  return (
    <svg
      aria-hidden
      data-claim-outline
      className="pointer-events-none absolute -inset-[calc(3px/var(--zoom,1))] size-[calc(100%+6px/var(--zoom,1))] overflow-visible"
    >
      <rect
        width="100%"
        height="100%"
        fill="none"
        // Sized against the zoom like the label. A stroke takes a fractional
        // width where a CSS outline snaps to whole pixels before the zoom.
        className="stroke-claim [stroke-width:calc(1.5px/var(--zoom,1))] [stroke-dasharray:calc(4.5px/var(--zoom,1))_calc(3px/var(--zoom,1))] motion-safe:animate-claim-outline"
      />
    </svg>
  )
}

interface FindingsMarkProps {
  frame: FrameRecord
  findings: readonly Finding[]
}

/**
 * The count of a frame's check findings beside its name, as a pill tinted in
 * the destructive hue when any finding is an error and the note hue when all
 * are warnings. It never shrinks, so a narrow frame truncates the name and
 * any claim tag and keeps the count. It opens a popover listing each finding, which a press
 * reaches through the hit layer and a key through the badge itself.
 */
function FindingsMark({ frame, findings }: FindingsMarkProps) {
  const open = useFindingsOpen(frame.ref)
  const count = findings.length
  const severity = severityOf(findings)
  const counted = `${count} finding${count === 1 ? '' : 's'}`
  return (
    <Popover
      open={open}
      onOpenChange={(next) => openFindings(next ? frame.ref : null)}
    >
      <PopoverTrigger
        data-findings-badge={frame.ref}
        aria-label={`${count} check finding${count === 1 ? '' : 's'}`}
        data-severity={severity}
        className="flex h-[18px] shrink-0 items-center gap-[3px] rounded-[9px] bg-[color-mix(in_srgb,var(--h)_34%,transparent)] pr-1.5 pl-[5px] font-medium text-[color-mix(in_srgb,var(--h)_55%,var(--foreground))] shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--h)_75%,transparent)] outline-none focus-visible:ring-2 focus-visible:ring-ring/50 data-[severity=error]:[--h:var(--destructive)] data-[severity=warning]:[--h:var(--note)]"
      >
        <TriangleAlert aria-hidden className="size-3 text-[var(--h)]" />
        {count}
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={6}
        initialFocus
        className="w-[330px] gap-1.5 p-2.5 text-body"
      >
        <PopoverTitle className="text-[11px] font-semibold text-muted-foreground">
          {counted} on {frame.name}
        </PopoverTitle>
        <FindingsList findings={findings} />
      </PopoverContent>
    </Popover>
  )
}
