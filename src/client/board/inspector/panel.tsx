import { useEffect, useState } from 'react'

import { useViewOnly } from '@/client/access/view-only'
import { toast } from '@/client/components/ui/toast'
import { cn } from '@/client/lib/cn'
import { useLive } from '@/client/live/store'
import { useFrameTheme } from '@/client/theme/store'
import type { UsedColor } from '@/shared/records/elements'
import type { FrameRecord } from '@/shared/records/list'
import type { TokenRow } from '@/shared/records/tokens'

import { useAuthor, useAuthorSource } from '../chrome/author'
import { AvatarMenu } from '../chrome/avatar-menu'
import { ZoomControl } from '../chrome/zoom-control'
import { ClaimAvatars } from '../claims/avatars'
import { useLiveMedia } from '../element/media'
import { usePendingFrames } from '../geometry/write'
import { useMode } from '../mode'
import { placeFree } from '../place/write'
import { type ElementKey, useSelection } from '../selection'
import { choosePreset, usePreset } from '../structure/tool'
import { useTokenTable } from '../tokens'
import { ArrangeSection } from './arrange-section'
import { AppearanceSection } from './element/appearance'
import { FillSection } from './element/fill'
import { LayoutSection } from './element/layout'
import { PositionSection } from './element/position'
import { SeveralElements } from './element/several'
import { ShadowSection } from './element/shadow'
import { StrokeSection } from './element/stroke'
import {
  fetchStyles,
  mergeColors,
  previewStyle,
  useFrameStyles,
  useLiveBody,
  useLiveElement,
} from './element/styles'
import { TextSection } from './element/text'
import { TypographySection } from './element/typography'
import { VideoSection } from './element/video'
import { type ElementChange, shownHash, writeElement } from './element/write'
import { ExportSection } from './export-section'
import { FrameSection } from './frame-section'
import { MotionSection } from './motion-section'
import { FRAME_TOOL_GROUPS } from './presets'
import { replaceColor } from './recolor'
import { SelectionColors } from './selection-colors'

/**
 * The right panel: the header of the avatar and the zoom level, over the
 * Frame tool's presets while that tool is on, else the Frame section for one
 * selected frame with its Fill and Export, or the `N frames` section and
 * Arrange for several, each ending on the colors they use, and a hint while
 * nothing is selected. An element selected inside the frame adds its
 * sections under Frame, whose name row it hides, and several selected inside
 * the frame take the panel with their shared sections. A tab that reads opens the
 * panel on one View only line, since every field under it reads greyed.
 */
export function InspectorPanel() {
  const name = useAuthor()
  const source = useAuthorSource()
  const playing = useMode((state) => state.mode === 'play')
  const framing = useMode(
    (state) => state.mode === 'edit' && state.tool === 'frame',
  )
  const viewOnly = useViewOnly()
  const listeners = useLive((state) => state.listeners)
  const claims = useLive((state) => state.claims)
  const page = useSelection((state) => state.page)
  const refs = useSelection((state) => state.frames)
  const element = useSelection((state) => state.element ?? null)
  const elements = useSelection((state) => state.elements)
  const shown = useLive((state) =>
    state.board?.projects
      .flatMap((project) => project.pages)
      .find((candidate) => candidate.ref === page),
  )
  const frames = usePendingFrames(
    shown?.frames.filter((frame) => refs.includes(frame.ref)) ?? [],
  )
  const inFrame = element && frames.length === 1 ? element : null
  const several = inFrame && (elements?.length ?? 0) > 1 ? elements : undefined
  return (
    <aside
      aria-label="Inspector"
      data-inspector
      className="flex h-full min-w-0 flex-col overflow-y-auto bg-sidebar text-body text-sidebar-foreground"
    >
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-sidebar-border px-3">
        <span className="flex items-center">
          <AvatarMenu name={name} source={source} />
          <ClaimAvatars listeners={listeners} claims={claims} />
        </span>
        <ZoomControl />
      </div>
      {viewOnly ? (
        <p className="border-b border-sidebar-border px-3 py-2.5 text-muted-foreground">
          View only. Run frameboard open to edit
        </p>
      ) : null}
      {framing ? (
        <PresetSection />
      ) : page && several && frames[0] ? (
        <SeveralElements page={page} frame={frames[0]} elements={several} />
      ) : page && frames.length > 0 ? (
        <>
          <FrameSection page={page} frames={frames} named={!inFrame} />
          {frames.length > 1 ? <ArrangeSection /> : null}
          {frames.length === 1 && !inFrame && frames[0] ? (
            <>
              <FrameFill page={page} frame={frames[0].ref} />
              <MotionSection
                key={`motion:${frames[0].ref}`}
                frame={frames[0]}
              />
              <ExportSection key={frames[0].ref} frame={frames[0]} />
            </>
          ) : null}
          {inFrame ? (
            <ElementSections page={page} element={inFrame} />
          ) : (
            <FramesColors page={page} frames={frames} />
          )}
        </>
      ) : (
        <div className="px-3 pt-2.5 pb-3 text-muted-foreground">
          {playing ? (
            <p>Playing. Nothing selects in Play.</p>
          ) : (
            <>
              <p>Select a frame to see its details.</p>
              <p className="mt-4">
                Click a frame, or drag on the canvas to select several.
              </p>
            </>
          )}
        </div>
      )}
    </aside>
  )
}

const SHADOW = '--shadow'

/** The project's color tokens, its `--shadow*` tokens, and its font tokens, empty until the table reads. */
function useProjectTokens(frame: string): {
  colors: TokenRow[]
  shadows: TokenRow[]
  fonts: TokenRow[]
} {
  const table = useTokenTable(frame.split('/')[0] ?? '')
  const tokens = table?.tokens ?? []
  return {
    // A shadow's value holds a color, so the table groups it with them.
    colors: tokens.filter(
      (row) => row.group === 'color' && !row.name.startsWith(SHADOW),
    ),
    shadows: tokens.filter((row) => row.name.startsWith(SHADOW)),
    fonts: tokens.filter((row) => row.group === 'font'),
  }
}

interface ElementSectionsProps {
  page: string
  element: ElementKey
}

/**
 * The selected element's sections in the order `inspector/text` draws them,
 * read from the live element and from the frame's static cascade, each
 * control disabled while the tab may not write. Nothing draws until the
 * frame's live page shows the element, which a placeholder never does.
 */
function ElementSections({ page, element }: ElementSectionsProps) {
  const canWrite = useLive((state) => state.canWrite)
  const theme = useFrameTheme(element.frame)
  const live = useLiveElement(element)
  const media = useLiveMedia(element)
  const styles = useFrameStyles(element.frame, element.index, element.hash)
  const { colors, shadows, fonts } = useProjectTokens(element.frame)

  if (!live) {
    return (
      <p className="px-3 pt-2.5 pb-3 text-muted-foreground">
        The element’s details show once its frame is on screen.
      </p>
    )
  }
  const disabled = !canWrite
  const write = (change: ElementChange) => writeElement(page, element, change)
  const preview = (property: string, value: string | null) =>
    previewStyle(element, property, value)
  const own = styles?.element
  return (
    <>
      {media ? (
        <VideoSection media={media} disabled={disabled} write={write} />
      ) : null}
      <PositionSection
        placement={live.placement}
        disabled={disabled}
        write={write}
        preview={preview}
        place={(spot) =>
          placeFree(page, element, spot, { inline: live.placement.inline })
        }
        hugs={own?.flow !== undefined && own.flow.size.width !== 'fixed'}
      />
      <LayoutSection
        layout={live.layout}
        flow={own?.flow}
        textOnly={live.textOnly}
        disabled={disabled}
        write={write}
        preview={preview}
      />
      <AppearanceSection
        opacity={live.opacity}
        radius={live.radius}
        rotation={live.rotation}
        disabled={disabled}
        write={write}
        preview={preview}
      />
      {live.holdsText ? (
        <TypographySection
          fonts={fonts}
          fontFamily={live.fontFamily}
          fontToken={own?.fontFamily?.token ?? null}
          fontSize={live.fontSize}
          fontWeight={live.fontWeight}
          lineHeight={live.lineHeight}
          letterSpacing={live.letterSpacing}
          textAlign={live.textAlign}
          details={live}
          disabled={disabled}
          write={write}
          preview={preview}
        />
      ) : null}
      <FillSection
        textOnly={live.textOnly}
        color={own?.color ?? null}
        backgroundColor={own?.backgroundColor ?? null}
        tokens={colors}
        theme={theme}
        inline={live.textOnly ? live.inline.color : live.inline.backgroundColor}
        shorthand={!live.textOnly && live.inline.background}
        disabled={disabled}
        write={write}
        preview={preview}
        currentColor={live.color}
      />
      {live.textOnly ? (
        <TextSection
          key={`${element.frame}\n${element.index}`}
          text={live.text}
          keepsBreaks={live.keepsBreaks}
          disabled={disabled}
          write={write}
          element={element}
        />
      ) : null}
      <StrokeSection
        bordered={live.bordered}
        borderColor={own?.borderColor ?? null}
        tokens={colors}
        theme={theme}
        inline={live.inline.border}
        disabled={disabled}
        write={write}
        preview={preview}
        currentColor={live.color}
      />
      <ShadowSection
        boxShadow={own?.boxShadow ?? null}
        shadows={shadows}
        theme={theme}
        disabled={disabled}
        write={write}
      />
      <SelectionColors
        key={`colors:${element.frame}\n${element.index}`}
        colors={styles?.colors ?? []}
        tokens={colors}
        theme={theme}
        onReplace={
          disabled
            ? undefined
            : (color, token) => void replaceColor(page, element, color, token)
        }
        selectIn={
          styles ? { page, frame: element.frame, hash: styles.hash } : undefined
        }
      />
    </>
  )
}

/**
 * One frame's Fill, the `background-color` of its `body` written as an
 * element edit, so it waits under a claim and undoes like one. Nothing
 * draws until the frame's live page shows its body. A file stating no
 * `body` has no bytes to write, which the edit refuses with a toast.
 */
function FrameFill({ page, frame }: { page: string; frame: string }) {
  const canWrite = useLive((state) => state.canWrite)
  const theme = useFrameTheme(frame)
  const body = useLiveBody(frame)
  const live = useLiveElement(body)
  const styles = useFrameStyles(frame, body?.index, body?.hash ?? '')
  const { colors } = useProjectTokens(frame)
  if (!body || !live) return null
  return (
    <FillSection
      textOnly={false}
      color={null}
      backgroundColor={styles?.element?.backgroundColor ?? null}
      tokens={colors}
      theme={theme}
      inline={live.inline.backgroundColor}
      shorthand={live.inline.background}
      disabled={!canWrite}
      write={(change) => writeElement(page, body, change)}
      preview={(property, value) => previewStyle(body, property, value)}
      currentColor={live.color}
    />
  )
}

/**
 * Selection colors for one frame or several, merged across them once each,
 * read again whenever one of them reloads. One frame replaces a raw color
 * across the whole frame, from the bytes it shows, and several replace
 * nothing, since one replace is one write to one file.
 */
function FramesColors({
  page,
  frames,
}: {
  page: string
  frames: readonly FrameRecord[]
}) {
  const canWrite = useLive((state) => state.canWrite)
  const [first] = frames
  const theme = useFrameTheme(first?.ref ?? '')
  const { colors: tokens } = useProjectTokens(first?.ref ?? '')
  const refs = frames.map((frame) => frame.ref).join('\n')
  const version = useLive((state) =>
    refs
      .split('\n')
      .map((ref) => state.reloads[ref] ?? 0)
      .join(':'),
  )
  const [held, setHeld] = useState<{
    refs: string
    colors: UsedColor[]
    hash: string | undefined
  } | null>(null)

  useEffect(() => {
    let current = true
    void Promise.all(
      refs.split('\n').map((ref) => fetchStyles(ref).catch(() => null)),
    ).then((answers) => {
      if (!current) return
      setHeld({
        refs,
        colors: mergeColors(answers.map((answer) => answer?.colors ?? [])),
        hash: answers[0]?.hash,
      })
    })
    return () => {
      current = false
    }
  }, [refs, version])

  const readHash = held?.refs === refs ? held.hash : undefined
  return (
    <SelectionColors
      key={refs}
      colors={held?.refs === refs ? held.colors : []}
      tokens={tokens}
      theme={theme}
      onReplace={
        canWrite && frames.length === 1 && first
          ? (color, token) => {
              const hash = shownHash(first.ref)
              if (hash === null) {
                toast.add({
                  title: 'Nothing replaced',
                  description:
                    'The frame is not on screen, so the bytes it shows could not be read. Scroll to it and try again.',
                  type: 'warning',
                })
                return
              }
              void replaceColor(page, { frame: first.ref, hash }, color, token)
            }
          : undefined
      }
      selectIn={
        frames.length === 1 && first && readHash
          ? { page, frame: first.ref, hash: readHash }
          : undefined
      }
    />
  )
}

/** The sizes the Frame tool places, grouped under each preset, one chosen at a time, the next canvas click placing it. */
function PresetSection() {
  const chosen = usePreset()
  return (
    <section
      aria-labelledby="inspector-presets"
      className="border-b border-sidebar-border px-3 pt-2.5 pb-3"
    >
      <h2 id="inspector-presets" className="mb-2 text-xs font-semibold">
        Frame
      </h2>
      <div className="-mx-1.5 flex flex-col">
        {FRAME_TOOL_GROUPS.map(({ group, label, icon: Icon, rows }) => (
          <div
            key={group}
            role="radiogroup"
            aria-labelledby={`inspector-presets-${group}`}
            className="flex flex-col"
          >
            <h3
              id={`inspector-presets-${group}`}
              className="px-1.5 pt-1.5 pb-0.5 text-label text-muted-foreground"
            >
              {label}
            </h3>
            {rows.map((row) => (
              <button
                key={row.name}
                type="button"
                role="radio"
                aria-checked={row.name === chosen}
                onClick={() => choosePreset(row.name)}
                className={cn(
                  'flex h-[26px] items-center gap-1.5 rounded-md px-1.5 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50',
                  row.name === chosen && 'bg-accent',
                )}
              >
                <Icon
                  aria-hidden
                  className="size-[13px] text-muted-foreground"
                  strokeWidth={1.6}
                />
                <span className="flex-1">{row.label}</span>
                {/* The accent fill under a chosen row drops muted text below 4.5:1. */}
                <span
                  className={cn(
                    'tabular-nums',
                    row.name === chosen
                      ? 'text-accent-foreground'
                      : 'text-muted-foreground',
                  )}
                >
                  {row.width} × {row.height}
                </span>
              </button>
            ))}
          </div>
        ))}
      </div>
      <p className="mt-2 text-muted-foreground">
        Click on the canvas to place it.
      </p>
    </section>
  )
}
