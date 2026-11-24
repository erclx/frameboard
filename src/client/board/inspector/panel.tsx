import { useEffect, useState } from 'react'

import { EditAccessButton } from '@/client/access/edit-access'
import { useEditOffered, useViewOnly } from '@/client/access/view-only'
import { toast } from '@/client/components/ui/toast'
import { cn } from '@/client/lib/cn'
import { useLive } from '@/client/live/store'
import { useFrameTheme } from '@/client/theme/store'
import type { UsedColor } from '@/shared/records/elements'
import type { FrameRecord } from '@/shared/records/list'
import type { TokenRow } from '@/shared/records/tokens'

import { useInstalledFonts } from '../assets/sourcing'
import { useAuthor, useAuthorSource } from '../chrome/author'
import { AvatarMenu } from '../chrome/avatar-menu'
import { ZoomControl } from '../chrome/zoom-control'
import { ClaimAvatars } from '../claims/avatars'
import { useLiveMedia } from '../element/media'
import { useLiveModel, writeStaged } from '../element/model'
import { type TreeEntry, useElementTree } from '../element/tree'
import { usePendingFrames } from '../geometry/write'
import { useMode } from '../mode'
import { placeFree } from '../place/write'
import { previewStepOn, stopPreview } from '../present/preview'
import { type ElementKey, useSelection } from '../selection'
import { choosePreset, usePreset } from '../structure/tool'
import { useTokenTable } from '../tokens'
import { ArrangeSection } from './arrange-section'
import { AppearanceSection } from './element/appearance'
import { FillSection } from './element/fill'
import { LayoutSection } from './element/layout'
import { ModelSection } from './element/model'
import { PositionSection } from './element/position'
import { SeveralElements } from './element/several'
import { ShadowSection } from './element/shadow'
import { StepSection } from './element/step'
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
import { FrameCrumb, FrameSection } from './frame-section'
import { FilmstripSection, MotionSection } from './motion-section'
import { PageSection, SlideSection } from './page-section'
import { PhoneLink } from './phone-link'
import { FRAME_TOOL_GROUPS } from './presets'
import { replaceColor } from './recolor'
import { SelectionColors } from './selection-colors'
import { InspectorTabs } from './tabs'

/**
 * The right panel, its Design, Slides, and Export tabs held across selections
 * and drawn for every selection kind. A read-only tab opens on one View only
 * line, since every field under it reads greyed.
 */
export function InspectorPanel({
  open,
}: {
  /** The ref of the page the canvas shows, whose Page section shows with nothing selected. */
  open?: string
} = {}) {
  const name = useAuthor()
  const source = useAuthorSource()
  const playing = useMode((state) => state.mode === 'play')
  const framing = useMode(
    (state) => state.mode === 'edit' && state.tool === 'frame',
  )
  const viewOnly = useViewOnly()
  const editOffered = useEditOffered()
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
  const openPage = useLive((state) =>
    state.board?.projects
      .flatMap((project) => project.pages)
      .find((candidate) => candidate.ref === open),
  )
  const frames = usePendingFrames(
    shown?.frames.filter((frame) => refs.includes(frame.ref)) ?? [],
  )
  const inFrame = element && frames.length === 1 ? element : null
  const several = inFrame && (elements?.length ?? 0) > 1 ? elements : undefined
  const canWrite = useLive((state) => state.canWrite)
  // The selection's page while one holds, else the page the canvas shows.
  const slidesPage = page && frames.length > 0 ? shown : openPage
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
        <p
          className={cn(
            'border-b border-sidebar-border text-muted-foreground',
            editOffered
              ? 'flex items-center justify-between gap-2 py-1.5 pr-1.5 pl-3'
              : 'px-3 py-2.5',
          )}
        >
          {editOffered ? (
            <>
              View only
              <EditAccessButton />
            </>
          ) : (
            'View only. Run frameboard open to edit'
          )}
        </p>
      ) : null}
      {framing ? (
        <PresetSection />
      ) : playing ? (
        <p className="px-3 pt-2.5 pb-3 text-muted-foreground">
          Playing. Nothing selects in Play.
        </p>
      ) : (
        <InspectorTabs
          head={
            page && inFrame && !several && frames[0] ? (
              <ElementCrumb page={page} frame={frames[0]} element={inFrame} />
            ) : null
          }
          design={
            page && several && frames[0] ? (
              <SeveralElements
                page={page}
                frame={frames[0]}
                elements={several}
              />
            ) : page && frames.length > 0 ? (
              <>
                {inFrame ? null : <FrameSection page={page} frames={frames} />}
                {frames.length > 1 ? <ArrangeSection /> : null}
                {frames.length === 1 && !inFrame && frames[0] ? (
                  <>
                    <FrameFill page={page} frame={frames[0].ref} />
                    <MotionSection
                      key={`motion:${frames[0].ref}`}
                      frame={frames[0]}
                    />
                  </>
                ) : null}
                {inFrame ? (
                  <ElementDesign page={page} element={inFrame} />
                ) : (
                  <FramesColors page={page} frames={frames} />
                )}
              </>
            ) : (
              <div className="px-3 pt-2.5 pb-3 text-muted-foreground">
                <p>Select a frame to see its details.</p>
                <p className="mt-4">
                  Click a frame, or drag on the canvas to select several.
                </p>
              </div>
            )
          }
          slides={
            <>
              {page && inFrame && !several ? (
                <ElementSlides page={page} element={inFrame} />
              ) : null}
              {page && frames.length > 0 ? (
                <SlideSection frames={frames} />
              ) : null}
              {slidesPage && frames.length === 0 ? (
                <p className="px-3 pt-2.5 pb-3 text-muted-foreground">
                  Select a slide to set its own transition and steps.
                </p>
              ) : null}
              {slidesPage ? (
                <PageSection
                  page={slidesPage}
                  selected={frames.map((frame) => frame.ref)}
                />
              ) : frames.length > 0 ? null : (
                <p className="px-3 pt-2.5 pb-3 text-muted-foreground">
                  Open a page to set how its slides present.
                </p>
              )}
            </>
          }
          export={
            page && inFrame && !several && frames[0] ? (
              <ElementExport frame={frames[0]} element={inFrame} />
            ) : frames.length === 1 && !inFrame && frames[0] ? (
              <>
                <ExportSection key={frames[0].ref} frame={frames[0]} />
                <FilmstripSection
                  key={`filmstrip:${frames[0].ref}`}
                  frame={frames[0]}
                />
                <div className="border-b border-sidebar-border px-3 pt-2.5 pb-3">
                  <PhoneLink frame={frames[0]} disabled={!canWrite} />
                </div>
              </>
            ) : (
              <p className="px-3 pt-2.5 pb-3 text-muted-foreground">
                Select one frame or element to export it.
              </p>
            )
          }
        />
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

interface ElementProps {
  page: string
  element: ElementKey
}

const NOT_ON_SCREEN = (
  <p className="px-3 pt-2.5 pb-3 text-muted-foreground">
    The element’s details show once its frame is on screen.
  </p>
)

/**
 * The selected element's Slides sections: which press of its slide reveals
 * it. Nothing draws until the frame's live page shows the element.
 */
function ElementSlides({ page, element }: ElementProps) {
  const canWrite = useLive((state) => state.canWrite)
  const live = useLiveElement(element)
  if (!live) return NOT_ON_SCREEN
  return (
    <StepSection
      step={live.step}
      disabled={!canWrite}
      write={(change) => writeElement(page, element, change)}
      onPreview={(effect) => previewStepOn(element, effect)}
      onPreviewEnd={stopPreview}
    />
  )
}

/** The selected element's Export, named for its frame and its Layers row. */
function ElementExport({
  frame,
  element,
}: {
  frame: FrameRecord
  element: ElementKey
}) {
  const tree = useElementTree(element.frame)
  return (
    <ExportSection
      key={`export:${element.frame}\n${element.index}`}
      frame={frame}
      element={{
        index: element.index,
        hash: element.hash,
        name: layerName(tree, element.index),
      }}
    />
  )
}

/**
 * The element's Design sections in `inspector/text` order, drawing nothing
 * until the live page shows the element, which a placeholder never does.
 */
function ElementDesign({ page, element }: ElementProps) {
  const canWrite = useLive((state) => state.canWrite)
  const theme = useFrameTheme(element.frame)
  const live = useLiveElement(element)
  const media = useLiveMedia(element)
  const model = useLiveModel(element)
  const styles = useFrameStyles(element.frame, element.index, element.hash)
  const { colors, shadows, fonts } = useProjectTokens(element.frame)
  const installedFonts = useInstalledFonts(element.frame.split('/')[0] ?? '')

  if (!live) return NOT_ON_SCREEN
  const disabled = !canWrite
  const write = (change: ElementChange) => writeElement(page, element, change)
  const preview = (property: string, value: string | null) =>
    previewStyle(element, property, value)
  const own = styles?.element
  return (
    <>
      {media ? (
        <VideoSection
          media={media}
          disabled={disabled}
          write={(change) =>
            writeElement(page, element, change, { previewed: true })
          }
        />
      ) : null}
      {model ? (
        <ModelSection
          model={model}
          disabled={disabled}
          write={(changes) => writeStaged(page, element, changes)}
        />
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
        model={model !== null}
        disabled={disabled}
        write={write}
        preview={preview}
      />
      {live.holdsText ? (
        <TypographySection
          fonts={fonts}
          installed={installedFonts}
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
        borderWidth={live.borderWidth}
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

/** The selected element's frame as the one row over its sections, under the name its Layers row shows. */
function ElementCrumb({
  page,
  frame,
  element,
}: {
  page: string
  frame: FrameRecord
  element: ElementKey
}) {
  const tree = useElementTree(element.frame)
  return (
    <FrameCrumb
      page={page}
      frame={frame}
      element={layerName(tree, element.index)}
    />
  )
}

/** The name an element's Layers row shows, or `element` until the frame's tree holds it. */
function layerName(tree: TreeEntry | null, index: number): string {
  const held =
    tree?.status === 'ready'
      ? tree.tree.elements.find((element) => element.index === index)
      : undefined
  return held?.name ?? 'element'
}

/**
 * A frame's Fill, written as an element edit on its `body` so it waits under
 * a claim and undoes like one. A file stating no `body` refuses it.
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
 * Selection colors across frames. Several frames replace nothing, since one
 * replace is one write to one file.
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
