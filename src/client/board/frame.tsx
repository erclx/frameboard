import { ExternalLink, Lock, Moon, MoveHorizontal, Sun } from 'lucide-react'
import { memo, useEffect, useMemo, useRef, useState } from 'react'

import { RenameField } from '@/client/components/rename-field'
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from '@/client/components/ui/popover'
import { cn } from '@/client/lib/cn'
import { useLive } from '@/client/live/store'
import { type Structure, structure } from '@/client/live/structure'
import { useUnseen } from '@/client/live/unseen'
import {
  flipFrame,
  frameTheme,
  useFrameTheme,
  useShownTheme,
} from '@/client/theme/store'
import { frameUrl } from '@/shared/board-urls'
import {
  BEZELS,
  pageCorners,
  screenCorners,
  shownBox,
  topInset,
  turnsWith,
} from '@/shared/frame-device'
import { referenceHeight } from '@/shared/frame-sizes'
import type { Finding } from '@/shared/records/check'
import type { Claim } from '@/shared/records/claims'
import type { FrameRecord } from '@/shared/records/list'
import { frameThemeUrl, type Theme } from '@/shared/theme'

import { request } from './bridge/channel'
import { followPage, shownHashOf } from './bridge/shown'
import { useCompare } from './changes/compare'
import { CompareControl, CompareView } from './changes/compare-view'
import { UnseenDot } from './changes/dot'
import { ClaimTag } from './claims/tag'
import { Bezel } from './device/bezel'
import { usePageColors } from './device/page-colors'
import { PoseButtons, RotateButtons } from './device/poses'
import { turnRefusal } from './device/turn'
import { FINDINGS_MARK, severityOf } from './findings/level'
import { FindingsList } from './findings/list'
import { FindingsCount } from './findings/mark'
import { openFindings, useFindingsOpen } from './findings/open'
import { RESTAMPED } from './frame-dom'
import { bindFrameKeys } from './frame-keys'
import { useWaitingOnFirstLoad } from './frame-loading'
import { useThemeInFrame } from './frame-theme'
import { useDrawnBox, usePendingBox } from './geometry/write'
import { useHiddenScrollbar } from './hidden-scrollbar'
import { LoadingBlock } from './loading-block'
import { useMode } from './mode'
import { useMotionDriver } from './motion/seek'
import { formatMoment, releaseMotion, useMotionHold } from './motion/store'
import { useEntered } from './play/entered'
import { measureHeight } from './preview/height'
import { measurePreview, usePreview } from './preview/store'
import { ScrollRail } from './scroll/rail'
import { awaitingHash, select, selectionStore, useSelection } from './selection'
import { useNotesShown } from './speaker-notes/shown'
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
 * One frame at its box with its label above. In Play an entered frame takes
 * focus, so Esc is bound into its window to reach the board.
 */
export const Frame = memo(function Frame({
  frame,
  live,
  version,
  findings,
  claim,
  unseen = false,
}: FrameProps) {
  // A released move holds until the board carries it, and a preview touches no box.
  const { x, y, width, height } = useDrawnBox(frame)
  const storedWidth = (usePendingBox(frame.ref) ?? frame.box).width
  const preview = usePreview(frame.ref)
  const hold = useMotionHold(frame.ref)
  const renaming = useRenamingFrame('canvas') === frame.ref
  const selected = useSelection((state) => state.frames.includes(frame.ref))
  const selectedAlone = useSelection(
    (state) => state.frames.length === 1 && state.frames[0] === frame.ref,
  )
  const iframe = useRef<HTMLIFrameElement>(null)
  const playing = useMode((state) => state.mode === 'play')
  // While notes are hidden, a slide holding one says so on its label.
  const notesShown = useNotesShown()
  const noteMark = !notesShown && Boolean(frame.speakerNotes) && !playing
  const entered = useEntered(frame.ref) && playing
  const theme = useFrameTheme(frame.ref)
  const findingsOpen = useFindingsOpen(frame.ref)
  const hasBase = useUnseen((state) => frame.ref in state.base)
  const compared = useCompare((state) =>
    state.ref === frame.ref ? state.hash : null,
  )
  // Read per load, so a record arriving before the reload stamps the file shown.
  const modifiedAt = useRef(frame.modifiedAt)
  useEffect(() => {
    modifiedAt.current = frame.modifiedAt
  }, [frame.modifiedAt])
  // Not on a rename alone, which moves the file the iframe already shows.
  const [loaded, setLoaded] = useState({ ref: frame.ref, version, live })
  if (loaded.version !== version || loaded.live !== live) {
    setLoaded({ ref: frame.ref, version, live })
  }
  // Not on a theme change, which rewrites the root rather than restart the frame.
  const src = useMemo(
    () =>
      loaded.live
        ? frameThemeUrl(loaded.ref, frameTheme(loaded.ref), loaded.version)
        : null,
    [loaded],
  )

  useThemeInFrame(iframe, theme, live)

  // Stamps the rendered file, so a pick made before an agent's reload is refused.
  useEffect(() => {
    const element = iframe.current
    if (!live || !element) return
    const stamp = () => {
      element.dataset.renderedAt = modifiedAt.current
    }
    element.addEventListener('load', stamp)
    return () => element.removeEventListener('load', stamp)
  }, [live])

  // Drops an element selection on a new page's foreign bytes, which may have shifted every index.
  useEffect(() => {
    const element = iframe.current
    if (!live || !element) return
    return followPage(element, () => {
      const { page, element: selected } = selectionStore.getState()
      const shown = shownHashOf(element)
      if (
        selected?.frame === frame.ref &&
        page &&
        shown !== selected.hash &&
        !awaitingHash(frame.ref, shown)
      ) {
        select(selectionStore, page, [frame.ref])
      }
      return () => {}
    })
  }, [live, frame.ref])

  // Read at the width's reference height, as the server's fit reads it.
  const previewWidth = preview?.width
  const { hugHeight } = frame
  // The page starts under a phone's status bar, so the box holds the page and the bar.
  const statusBar = topInset(frame.device, frame.turn)
  useEffect(() => {
    const element = iframe.current
    if (!live || !element || previewWidth === undefined || !hugHeight) return
    // Only the newest read stores a height, so two restamps in quick order store one.
    let latest = 0
    const measure = () => {
      const run = ++latest
      void measureHeight(element, referenceHeight(previewWidth)).then(
        (height) => {
          if (run !== latest) return
          measurePreview(
            frame.ref,
            previewWidth,
            height === null ? null : height + statusBar,
          )
        },
      )
    }
    const stop = followPage(element, () => {
      measure()
      return () => {}
    })
    element.addEventListener(RESTAMPED, measure)
    return () => {
      latest = -1
      stop()
      element.removeEventListener(RESTAMPED, measure)
    }
  }, [live, previewWidth, hugHeight, frame.ref, statusBar])

  // An entered page-tall phone shows one screen with its page scrolling, while its label and notes keep the stored box.
  const drawnHeight = entered
    ? shownBox({
        box: { width, height },
        device: frame.device,
        scroll: frame.scroll,
        turn: frame.turn,
        hugHeight: frame.hugHeight,
      }).height
    : height
  const colors = usePageColors(iframe, live && statusBar > 0, theme)
  const waiting = useWaitingOnFirstLoad(iframe, live)
  const shownShort = drawnHeight < height
  useHiddenScrollbar(iframe, live, frame.scroll || shownShort)
  useMotionDriver(iframe, frame.ref, live, playing)

  // Leaving the one-screen view forgets where the page was scrolled to.
  useEffect(() => {
    const element = iframe.current
    if (!live || !shownShort || !element) return
    return () => void request(element, 'scroll-act', { act: 'to', top: 0 })
  }, [live, shownShort])

  useEffect(() => {
    const element = iframe.current
    if (!playing || !element) return
    return bindFrameKeys(element, PLAY_KEYS, { keepTyping: false })
  }, [playing, live])

  // An entered frame takes the keys, so focus moves into its page.
  useEffect(() => {
    if (entered && live) iframe.current?.focus()
  }, [entered, live])

  // Play shows the frames as they ship, so a claim draws nothing there.
  const claimed = claim && !playing ? claim : undefined
  const held = hold && !hold.playing && !playing ? hold : undefined
  // Chrome beside the frame stands past a device body rather than on it.
  const inset = frame.device ? BEZELS[frame.device].border : 0
  // A laptop's chin and base stand below its screen deeper than its lid.
  const below = frame.device ? BEZELS[frame.device].bottom : 0
  // The screen rounds under its bezel, whose body cannot cover a square corner.
  const corners = frame.device ? screenCorners(frame.device) : undefined
  // The page stands under a phone's status bar, square where the two meet.
  const page = frame.device
    ? {
        borderRadius: pageCorners(frame.device, frame.turn),
        ...(statusBar
          ? { marginTop: statusBar, height: `calc(100% - ${statusBar}px)` }
          : {}),
      }
    : {}

  return (
    <div
      data-frame={frame.ref}
      data-selected={selected || undefined}
      data-claimed={claimed ? true : undefined}
      data-findings-open={findingsOpen || undefined}
      data-entered={entered || undefined}
      className={cn(
        'absolute',
        // The entered frame alone takes the pointer back from the shield.
        entered &&
          'pointer-events-auto [outline:calc(2px/var(--zoom,1))_solid_var(--primary)]',
        playing &&
          !entered &&
          'data-label-hover:[outline:calc(1px/var(--zoom,1))_solid_color-mix(in_srgb,var(--primary)_45%,transparent)]',
      )}
      style={{
        left: x,
        top: y,
        width,
        height: drawnHeight,
        zIndex: frame.order,
      }}
    >
      <div
        className={cn(
          'absolute bottom-full left-0 flex origin-bottom-left items-center gap-1.5 pb-1 text-label font-normal [transform:scale(calc(1/var(--zoom,1)))]',
          // Hidden while crowded, unless hovered, selected, or its findings are open.
          '[[data-label-crowded]:not([data-label-hover]):not([data-selected]):not([data-findings-open])>&]:hidden',
          claimed ? 'text-claim' : 'text-muted-foreground',
          'max-w-(--label-room)',
          !playing &&
            '[[data-label-hover]>&]:max-w-[calc(var(--label-room)-22px)] [[data-selected]>&]:max-w-[calc(var(--label-room)-22px)]',
          // `LabelRename` draws the field over it.
          renaming && 'invisible',
        )}
        // A narrower preview keeps the stored box's room for the name and chip.
        style={{
          ['--label-room' as string]: `calc(${Math.max(width, storedWidth)}px * var(--zoom, 1))`,
          ...(inset ? { bottom: `calc(100% + ${inset}px)`, left: -inset } : {}),
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
          className={cn(
            'truncate',
            (preview || claimed || held || frame.kit || noteMark) &&
              'shrink-[1000]',
          )}
        >
          {frame.name}
        </span>
        {noteMark ? <NoteMark /> : null}
        {preview ? <PreviewChip width={preview.width} /> : null}
        {held ? <HeldChip frameRef={frame.ref} at={held.at} /> : null}
        {frame.kit ? <KitChip project={frame.project} kit={frame.kit} /> : null}
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
      {playing || renaming ? null : (
        <OpenAlone frameRef={frame.ref} name={frame.name} inset={inset} />
      )}
      {live ? (
        <iframe
          ref={iframe}
          title={frame.name}
          src={src ?? undefined}
          aria-busy={waiting || undefined}
          // A flipped frame with no background paints its own theme's color.
          style={{ colorScheme: theme, ...page }}
          className="block size-full border-0 bg-[color:Canvas]"
        />
      ) : (
        <div
          data-placeholder
          className="size-full border border-border bg-card"
          style={{ borderRadius: corners }}
        />
      )}
      {waiting ? <LoadingBlock theme={theme} corners={corners} /> : null}
      {frame.device ? (
        <Bezel
          device={frame.device}
          width={width}
          height={drawnHeight}
          pose={frame.pose}
          island={frame.island}
          turn={frame.turn}
          colors={colors}
          theme={theme}
        />
      ) : null}
      {frame.device === 'foldable' &&
      frame.pose &&
      selectedAlone &&
      !playing ? (
        <PoseButtons
          frameRef={frame.ref}
          name={frame.name}
          pose={frame.pose}
          below={below}
          off={frame.locked ? `Unlock ${frame.name} to fold it` : undefined}
        />
      ) : null}
      {turnsWith(frame.device) && selectedAlone && !playing ? (
        <RotateButtons
          frameRef={frame.ref}
          name={frame.name}
          turn={frame.turn}
          below={below}
          off={turnRefusal(frame)}
        />
      ) : null}
      {frame.scroll && live && !playing ? (
        <ScrollRail
          iframe={iframe}
          live={live}
          inset={inset}
          className="invisible [[data-label-hover]_&]:visible [[data-selected]_&]:visible"
        />
      ) : null}
      {live && compared && !playing ? (
        <CompareView frameRef={frame.ref} name={frame.name} hash={compared} />
      ) : null}
      {claimed ? <ClaimOutline /> : null}
      {entered ? <EnteredTag inset={inset} below={below} /> : null}
      {findings && findings.length > 0 ? (
        <span
          aria-hidden
          data-findings-dot
          data-findings-badge={frame.ref}
          data-severity={severityOf(findings)}
          className={cn(
            'absolute top-0 left-0 hidden size-2.5 rounded-full shadow-[0_0_0_2px_var(--background)] [transform:translate(-50%,-50%)_scale(calc(1/var(--zoom,1)))] data-[severity=error]:bg-destructive data-[severity=warning]:bg-muted-foreground',
            // Shown while the label hides, top left, since a frame note takes the top right.
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
 * The label's rename field, mounted above the hit layer rather than in the
 * label, so a click inside it places the caret instead of pressing the canvas.
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
 * The frame's theme on its label, a chip while flipped alone so a flipped
 * frame never reads as a theme bug, giving way before the findings count.
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
        className="invisible grid h-[18px] w-[18px] min-w-0 shrink place-items-center overflow-hidden rounded-[5px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [[data-label-hover]_&]:visible"
      >
        <Sun aria-hidden className="size-3" />
      </button>
    )
  }
  const Icon = theme === 'dark' ? Moon : Sun
  const shown = theme === 'dark' ? 'Dark' : 'Light'
  // The name opens on the shown word, so voice control reaches it by what it reads (WCAG 2.5.3).
  const named = `${shown}: flip ${name} to ${to}`
  return (
    <button
      type="button"
      data-label-control
      aria-label={named}
      title={named}
      onClick={() => flipFrame(frameRef)}
      className="flex h-[18px] min-w-0 shrink items-center gap-1 overflow-hidden rounded-[5px] bg-[color-mix(in_srgb,var(--foreground)_14%,transparent)] px-[5px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Icon aria-hidden className="size-3" />
      {shown}
    </button>
  )
}

/**
 * Opens the frame's own page in a new tab, as `canon/design/canvas/open-alone`
 * draws it, reached through the hit layer as the theme marker is.
 */
function OpenAlone({
  frameRef,
  name,
  inset,
}: {
  frameRef: string
  name: string
  /** Board units past the frame's top right, the width of any device body. */
  inset: number
}) {
  const label = `Open ${name} alone`
  return (
    <div
      className="absolute right-0 bottom-full flex origin-bottom-right pb-1 [transform:scale(calc(1/var(--zoom,1)))]"
      style={inset ? { bottom: `calc(100% + ${inset}px)`, right: -inset } : {}}
    >
      <a
        href={frameUrl(frameRef)}
        target="_blank"
        rel="noopener"
        data-label-control
        aria-label={label}
        title="Open alone"
        className="invisible grid size-[18px] place-items-center rounded-[5px] text-muted-foreground outline-none hover:bg-[color-mix(in_srgb,var(--foreground)_10%,transparent)] hover:text-foreground focus-visible:visible focus-visible:ring-2 focus-visible:ring-ring [[data-label-hover]_&]:visible [[data-selected]_&]:visible"
      >
        <ExternalLink aria-hidden className="size-[11px]" strokeWidth={1.6} />
      </a>
    </div>
  )
}

/**
 * The previewed width beside the name, ending in an ellipsis rather than
 * clipping, so a narrow label never shows a different number.
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

/** Drawn only while notes are hidden, since a shown strip already carries the note. */
function NoteMark() {
  return (
    <span
      data-note-mark
      className="shrink-0 rounded-[4px] bg-muted px-1 text-[10px] leading-[14px] text-muted-foreground"
    >
      <span className="sr-only">Speaker </span>note
    </span>
  )
}

/** The kit a frame draws with, by its title where the project still holds it. */
function KitChip({ project, kit }: { project: string; kit: string }) {
  const title = useLive(
    (state) =>
      state.board?.projects
        .find(({ name }) => name === project)
        ?.kits.find(({ name }) => name === kit)?.title,
  )
  return (
    <span
      data-kit-chip
      className="flex h-[18px] min-w-0 shrink items-center overflow-hidden rounded-[5px] bg-primary-fill px-[5px] font-medium text-primary-foreground"
    >
      <span className="truncate">
        <span className="sr-only">Kit </span>
        {title ?? kit}
      </span>
    </span>
  )
}

/**
 * The moment a held frame stands at, so a frame left frozen never reads as
 * broken, and a press hands it back to its own clock.
 */
function HeldChip({ frameRef, at }: { frameRef: string; at: number }) {
  const moment = `${formatMoment(at)} s`
  return (
    <button
      type="button"
      data-label-control
      data-held-chip
      aria-label={`Held at ${moment}. Resume`}
      title="Held in this tab. Press to resume."
      onClick={() => releaseMotion(frameRef)}
      className="flex h-[18px] min-w-0 shrink items-center overflow-hidden rounded-[5px] bg-[color-mix(in_srgb,var(--foreground)_14%,transparent)] px-[5px] text-foreground outline-none hover:bg-[color-mix(in_srgb,var(--foreground)_20%,transparent)] focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="truncate">Held {moment}</span>
    </button>
  )
}

/** The entered frame's tag under its bottom left, at a constant screen size. */
function EnteredTag({ inset, below }: { inset: number; below: number }) {
  return (
    <div
      className="absolute top-full left-0 origin-top-left pt-1 [transform:scale(calc(1/var(--zoom,1)))]"
      style={below ? { top: `calc(100% + ${below}px)`, left: -inset } : {}}
    >
      <span className="block rounded-[4px] bg-primary-fill px-[5px] py-px text-[10px] font-medium whitespace-nowrap text-primary-foreground">
        In frame, Esc to leave
      </span>
    </div>
  )
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
        // A stroke, since a CSS outline snaps to whole pixels before the zoom.
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
 * The findings count beside the name, which never shrinks, so a narrow frame
 * truncates the name first, and opens a popover listing each finding.
 */
function FindingsMark({ frame, findings }: FindingsMarkProps) {
  const open = useFindingsOpen(frame.ref)
  const popup = useRef<HTMLDivElement>(null)
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
        // Play passes the pointer through the frames' layer, so the badge takes it back.
        className={cn(
          FINDINGS_MARK,
          'pointer-events-auto outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        <FindingsCount count={count} severity={severity} />
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={6}
        ref={popup}
        // Focus on the list, so a second Enter on the badge switches no rule off.
        initialFocus={popup}
        className="w-[330px] gap-1.5 p-2.5 text-body"
      >
        <PopoverTitle className="text-[11px] font-semibold text-muted-foreground">
          {counted} on {frame.name}
        </PopoverTitle>
        <FindingsList findings={findings} project={frame.project} />
      </PopoverContent>
    </Popover>
  )
}
