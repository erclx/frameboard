import { NotebookText } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/client/lib/cn'
import { useLive } from '@/client/live/store'
import { type Structure, structure } from '@/client/live/structure'
import {
  DEFAULT_DIRECTION,
  DEFAULT_TRANSITION_MS,
  type Direction,
  DIRECTIONS,
  SAME_AS_PAGE_WORD,
  takesDirection,
  type Transition,
  transitionLabel,
} from '@/shared/present-transition'
import type { FrameRecord, PageRecord } from '@/shared/records/list'

import { liveIframe } from '../frame-dom'
import { reportRefusal } from '../left-panel/page-actions'
import { playPreview, previewTransition, stopPreview } from '../present/preview'
import { EditKeyframes } from '../present/transition'
import { setNotesShown, useNotesShown } from '../speaker-notes/shown'
import type { TileOption } from './effect-tiles'
import { EffectTiles } from './effect-tiles'
import { TypePicker } from './element/typography'
import { LabelTip } from './label-tip'
import { useTransitionNames } from './transition-names'

/** The lengths the Duration menu offers, a page holding another adding its own. */
const DURATIONS = [200, 300, 500, 800, 1000] as const

const DIRECTION_LABELS = {
  left: 'Left',
  right: 'Right',
  up: 'Up',
  down: 'Down',
} as const satisfies Record<Direction, string>

/** The tip on a transition setting's label, saying the board draws it and never the file. */
export const TRANSITION_TIP =
  'Drawn by the board while presenting. Slide files are unchanged.'

/** One tile per transition name, each playing that transition's arrival at `ms`. */
function transitionTiles(
  names: readonly string[],
  project: string,
  direction: Direction,
  ms: number,
): TileOption[] {
  return names.map((value) => ({
    value,
    label: transitionLabel(value),
    picture:
      value === 'none'
        ? { kind: 'still' }
        : {
            kind: 'transition',
            travel: {
              transition: {
                name: value,
                direction: takesDirection(value) ? direction : null,
                ms,
              },
              back: false,
            },
            project,
          },
  }))
}

/**
 * Plays `transition` on each of `refs` as its slide would arrive, one
 * preview at a time, and on the tile alone when no slide is selected.
 */
function previewOn(
  refs: readonly string[],
  transition: Transition,
  project: string,
): void {
  if (refs.length === 0) return
  const travel = {
    transition: {
      name: transition.name,
      direction: takesDirection(transition.name)
        ? (transition.direction ?? DEFAULT_DIRECTION)
        : null,
      ms: transition.ms ?? DEFAULT_TRANSITION_MS,
    },
    back: false,
  }
  playPreview(() => {
    const ends = refs.flatMap((ref) => {
      const iframe = liveIframe(ref)
      return iframe ? [previewTransition(iframe, travel, project)] : []
    })
    return () => {
      for (const end of ends) end()
    }
  })
}

/**
 * The open page's transition, direction, and length, each pick writing the
 * page's `layout.json` in one undo step and keeping the other two. Hovering
 * a tile plays it on the selected slides, and on the tile alone with none.
 */
export function PageSection({
  page,
  selected = [],
  calls = structure,
}: {
  page: PageRecord
  /** The selected slides a hovered tile plays on. */
  selected?: readonly string[]
  calls?: Structure
}) {
  const canWrite = useLive((state) => state.canWrite)
  const held = page.transition
  const names = useTransitionNames(page.project)
  const name = held?.name ?? 'none'
  const direction = held?.direction ?? DEFAULT_DIRECTION
  const ms = held?.ms ?? DEFAULT_TRANSITION_MS
  const durations = [...new Set([...DURATIONS, ms])].sort((a, b) => a - b)
  const shownMs = name === 'none' ? DEFAULT_TRANSITION_MS : ms

  const write = (next: Transition | null) => {
    calls
      .setPageTransition(page.ref, next)
      .catch(reportRefusal('Couldn’t set the slide transition'))
  }
  /** The transition with one key changed, dropping a direction the name takes none of. */
  const withChange = (change: Partial<Transition>): Transition => {
    const merged = { ...held, name, ...change }
    const { direction: kept, ...rest } = merged
    return takesDirection(merged.name) && kept
      ? { ...rest, direction: kept }
      : rest
  }

  return (
    <section
      aria-labelledby="inspector-page"
      className="border-b border-sidebar-border px-3 pt-2.5 pb-3"
    >
      <LabelTip
        label="Page"
        tip={TRANSITION_TIP}
        tipId="inspector-page-tip"
        className="mb-2"
      >
        <h2 id="inspector-page" className="text-xs font-semibold">
          Page
        </h2>
      </LabelTip>
      <span
        id="inspector-page-transition"
        className="mb-1 block text-caption text-muted-foreground"
      >
        Slide transition
      </span>
      <EditKeyframes project={page.project} />
      <EffectTiles
        labelledBy="inspector-page-transition"
        describedBy="inspector-page-tip"
        options={transitionTiles(names, page.project, direction, shownMs)}
        current={name}
        columns={4}
        disabled={!canWrite}
        onPick={(value) => {
          const picked = names.find((candidate) => candidate === value)
          if (!picked) return
          write(picked === 'none' ? null : withChange({ name: picked }))
        }}
        onPreview={(value) =>
          value === 'none'
            ? stopPreview()
            : previewOn(selected, withChange({ name: value }), page.project)
        }
        onPreviewEnd={stopPreview}
      />
      {name === 'none' ? null : (
        <Setting title="Duration">
          <TypePicker
            label="Duration"
            shown={`${ms} ms`}
            current={String(ms)}
            options={durations.map((value) => ({
              value: String(value),
              name: `${value} ms`,
            }))}
            disabled={!canWrite}
            onPick={(value) => write(withChange({ ms: Number(value) }))}
            className="min-w-0 flex-1"
          />
        </Setting>
      )}
      {takesDirection(name) ? (
        <Setting title="Direction">
          <TypePicker
            label="Direction"
            shown={DIRECTION_LABELS[direction]}
            current={direction}
            options={DIRECTIONS.map((value) => ({
              value,
              name: DIRECTION_LABELS[value],
            }))}
            disabled={!canWrite}
            onPick={(value) => {
              const picked = DIRECTIONS.find((candidate) => candidate === value)
              if (picked) write(withChange({ direction: picked }))
            }}
            className="min-w-0 flex-1"
          />
        </Setting>
      ) : null}
      <NotesButton />
    </section>
  )
}

/**
 * Shows a speaker notes strip under every slide of the page, or puts every
 * one away. It writes no file, so a reader tab can press it too.
 */
function NotesButton() {
  const shown = useNotesShown()
  return (
    <button
      type="button"
      aria-pressed={shown}
      onClick={() => setNotesShown(!shown)}
      className={cn(
        'mt-2.5 inline-flex h-6 items-center gap-1.5 rounded-[7px] px-[9px] text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
        shown
          ? 'bg-foreground text-background hover:bg-foreground/85'
          : 'bg-input text-foreground hover:bg-accent',
      )}
    >
      <NotebookText aria-hidden className="size-[13px]" strokeWidth={1.6} />
      {shown ? 'Notes shown' : 'Notes hidden'}
    </button>
  )
}

function Setting({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-2 flex items-center gap-1.5">
      <span
        aria-hidden
        className="w-[58px] shrink-0 text-caption text-muted-foreground"
      >
        {title}
      </span>
      {children}
    </div>
  )
}

const SAME_AS_PAGE = SAME_AS_PAGE_WORD

/**
 * Each selected frame's own transition, marking no tile where they differ.
 * A pick writes every frame's `layout.json` entry in one undo step.
 */
export function SlideSection({
  frames,
  calls = structure,
}: {
  frames: readonly FrameRecord[]
  calls?: Structure
}) {
  const canWrite = useLive((state) => state.canWrite)
  const project = frames[0]?.project ?? ''
  const names = useTransitionNames(project)
  const values = frames.map((frame) => frame.transition?.name ?? SAME_AS_PAGE)
  const current = values.every((value) => value === values[0])
    ? (values[0] ?? null)
    : null
  return (
    <section
      aria-labelledby="inspector-slide"
      className="border-b border-sidebar-border px-3 pt-2.5 pb-3"
    >
      <LabelTip
        label="This slide"
        tip={TRANSITION_TIP}
        tipId="inspector-slide-tip"
        className="mb-2"
      >
        <h2 id="inspector-slide" className="text-xs font-semibold">
          This slide
        </h2>
      </LabelTip>
      <EditKeyframes project={project} />
      <EffectTiles
        labelledBy="inspector-slide"
        describedBy="inspector-slide-tip"
        options={[
          {
            value: SAME_AS_PAGE,
            label: 'Page',
            name: 'Same as page',
            picture: { kind: 'still' },
          },
          ...transitionTiles(
            names,
            project,
            DEFAULT_DIRECTION,
            DEFAULT_TRANSITION_MS,
          ),
        ]}
        current={current}
        columns={4}
        disabled={!canWrite}
        onPick={(value) => {
          const name = names.find((candidate) => candidate === value)
          calls
            .setFrameTransition(
              frames.map((frame) => frame.ref),
              name ? { name } : null,
            )
            .catch(reportRefusal('Couldn’t set the slide transition'))
        }}
        onPreview={(value) =>
          value === SAME_AS_PAGE || value === 'none'
            ? stopPreview()
            : previewOn(
                frames.map((frame) => frame.ref),
                { name: value },
                project,
              )
        }
        onPreviewEnd={stopPreview}
      />
    </section>
  )
}
