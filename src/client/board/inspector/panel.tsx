import { cn } from 'cn'
import { useEffect, useState } from 'react'

import { useViewOnly } from '@/client/access/view-only'
import { useLive } from '@/client/live/store'
import { useFrameTheme } from '@/client/theme/store'
import type { StyleValue } from '@/shared/records/elements'
import type { FrameRecord } from '@/shared/records/list'
import type { TokenRow } from '@/shared/records/tokens'

import { useAuthor } from '../chrome/author'
import { AvatarMenu } from '../chrome/avatar-menu'
import { ZoomControl } from '../chrome/zoom-control'
import { ClaimAvatars } from '../claims/avatars'
import { usePendingFrames } from '../geometry/write'
import { useMode } from '../mode'
import { type ElementKey, useSelection } from '../selection'
import { choosePreset, usePreset } from '../structure/tool'
import { useTokenTable } from '../tokens'
import { ArrangeSection } from './arrange-section'
import { ChecksSection } from './checks-section'
import { AppearanceSection } from './element/appearance'
import { FillSection } from './element/fill'
import { ShadowSection } from './element/shadow'
import { StrokeSection } from './element/stroke'
import {
  fetchStyles,
  previewStyle,
  useFrameStyles,
  useLiveBody,
  useLiveElement,
} from './element/styles'
import { TextSection } from './element/text'
import { TypographySection } from './element/typography'
import { type ElementChange, writeElement } from './element/write'
import { FrameSection } from './frame-section'
import { FRAME_TOOL_GROUPS } from './presets'
import { SelectionColors } from './selection-colors'

/**
 * The right panel: the header of the avatar and the zoom level, over the
 * Frame tool's presets while that tool is on, else the Frame section for one
 * selected frame, or the `N frames` section and
 * Arrange for several, each with the colors they use, and a hint while
 * nothing is selected. An element selected inside the frame adds its
 * sections under Frame, whose name row it hides. A tab that reads opens the
 * panel on one View only line, since every field under it reads greyed.
 */
export function InspectorPanel() {
  const name = useAuthor() ?? null
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
  const shown = useLive((state) =>
    state.board?.projects
      .flatMap((project) => project.pages)
      .find((candidate) => candidate.ref === page),
  )
  const frames = usePendingFrames(
    shown?.frames.filter((frame) => refs.includes(frame.ref)) ?? [],
  )
  const inFrame = element && frames.length === 1 ? element : null
  return (
    <aside
      aria-label="Inspector"
      data-inspector
      className="flex h-full min-w-0 flex-col overflow-y-auto bg-sidebar text-body text-sidebar-foreground"
    >
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-sidebar-border px-3">
        <span className="flex items-center">
          <AvatarMenu name={name} />
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
      ) : page && frames.length > 0 ? (
        <>
          <FrameSection page={page} frames={frames} named={!inFrame} />
          {frames.length > 1 ? <ArrangeSection /> : null}
          {frames.length === 1 && !inFrame && frames[0] ? (
            <>
              <FrameFill page={page} frame={frames[0].ref} />
              <ChecksSection frame={frames[0].ref} />
            </>
          ) : null}
          {inFrame ? (
            <ElementSections page={page} element={inFrame} />
          ) : (
            <FramesColors frames={frames} />
          )}
        </>
      ) : (
        <div className="px-3 pt-2.5 pb-3 text-muted-foreground">
          {playing ? (
            <p>Playing. Nothing selects while frames take the clicks.</p>
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
      <AppearanceSection
        opacity={live.opacity}
        radius={live.radius}
        disabled={disabled}
        write={write}
        preview={preview}
      />
      {live.holdsText ? (
        <TypographySection
          fonts={fonts}
          fontFamily={live.fontFamily}
          fontSize={live.fontSize}
          fontWeight={live.fontWeight}
          lineHeight={live.lineHeight}
          letterSpacing={live.letterSpacing}
          textAlign={live.textAlign}
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
        colors={styles?.colors ?? []}
        tokens={colors}
        theme={theme}
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
 * read again whenever one of them reloads.
 */
function FramesColors({ frames }: { frames: readonly FrameRecord[] }) {
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
    colors: StyleValue[]
  } | null>(null)

  useEffect(() => {
    let current = true
    void Promise.all(
      refs.split('\n').map((ref) => fetchStyles(ref).catch(() => null)),
    ).then((answers) => {
      if (!current) return
      const merged = new Map<string, StyleValue>()
      for (const color of answers.flatMap((answer) => answer?.colors ?? [])) {
        const key = `${color.token ?? color.value.toLowerCase()}:${color.percent}`
        if (!merged.has(key)) merged.set(key, color)
      }
      setHeld({ refs, colors: [...merged.values()] })
    })
    return () => {
      current = false
    }
  }, [refs, version])

  return (
    <SelectionColors
      colors={held?.refs === refs ? held.colors : []}
      tokens={tokens}
      theme={theme}
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
        {FRAME_TOOL_GROUPS.map(({ preset, label, icon: Icon, rows }) => (
          <div
            key={preset}
            role="radiogroup"
            aria-labelledby={`inspector-presets-${preset}`}
            className="flex flex-col"
          >
            <h3
              id={`inspector-presets-${preset}`}
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
