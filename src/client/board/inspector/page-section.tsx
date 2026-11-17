import type { ReactNode } from 'react'

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

import { reportRefusal } from '../left-panel/page-actions'
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

/**
 * The open page's transition, direction, and length, each pick writing the
 * page's `layout.json` in one undo step and keeping the other two.
 */
export function PageSection({
  page,
  calls = structure,
}: {
  page: PageRecord
  calls?: Structure
}) {
  const canWrite = useLive((state) => state.canWrite)
  const held = page.transition
  const names = useTransitionNames(page.project)
  const name = held?.name ?? 'none'
  const direction = held?.direction ?? DEFAULT_DIRECTION
  const ms = held?.ms ?? DEFAULT_TRANSITION_MS
  const durations = [...new Set([...DURATIONS, ms])].sort((a, b) => a - b)

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
      <Setting title="Slide transition">
        <TypePicker
          label="Slide transition"
          describedBy="inspector-page-tip"
          shown={transitionLabel(name)}
          current={name}
          options={names.map((value) => ({
            value,
            name: transitionLabel(value),
          }))}
          disabled={!canWrite}
          onPick={(value) => {
            const picked = names.find((candidate) => candidate === value)
            if (!picked) return
            write(picked === 'none' ? null : withChange({ name: picked }))
          }}
          className="w-full"
        />
      </Setting>
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
            className="w-full"
          />
        </Setting>
      ) : null}
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
            className="w-full"
          />
        </Setting>
      )}
    </section>
  )
}

function Setting({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-2 first-of-type:mt-0">
      <span
        aria-hidden
        className="mb-1 block text-caption text-muted-foreground"
      >
        {title}
      </span>
      {children}
    </div>
  )
}

const SAME_AS_PAGE = SAME_AS_PAGE_WORD

/**
 * The transition each selected frame arrives with while presenting, Same as
 * page or a named one over its page's, reading Mixed where the frames
 * differ. A pick writes every frame's `layout.json` entry in one undo step.
 */
export function SlideSection({
  frames,
  calls = structure,
}: {
  frames: readonly FrameRecord[]
  calls?: Structure
}) {
  const canWrite = useLive((state) => state.canWrite)
  const names = useTransitionNames(frames[0]?.project)
  const values = frames.map((frame) => frame.transition?.name ?? SAME_AS_PAGE)
  const current = values.every((value) => value === values[0])
    ? (values[0] ?? null)
    : null
  const label = (value: string) =>
    value === SAME_AS_PAGE ? 'Same as page' : transitionLabel(value)
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
      <TypePicker
        label="This slide"
        describedBy="inspector-slide-tip"
        shown={current === null ? 'Mixed' : label(current)}
        current={current}
        options={[
          { value: SAME_AS_PAGE, name: label(SAME_AS_PAGE) },
          ...names.map((value) => ({ value, name: label(value) })),
        ]}
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
        className="w-full"
      />
    </section>
  )
}
