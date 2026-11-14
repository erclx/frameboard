import type { ReactNode } from 'react'

import { useLive } from '@/client/live/store'
import { type Structure, structure } from '@/client/live/structure'
import {
  DEFAULT_DIRECTION,
  DEFAULT_TRANSITION_MS,
  type Direction,
  DIRECTIONS,
  takesDirection,
  type Transition,
  transitionLabel,
  TRANSITIONS,
} from '@/shared/present-transition'
import type { PageRecord } from '@/shared/records/list'

import { reportRefusal } from '../left-panel/page-actions'
import { TypePicker } from './element/typography'

/** The lengths the Duration menu offers, a page holding another adding its own. */
const DURATIONS = [200, 300, 500, 800, 1000] as const

const DIRECTION_LABELS = {
  left: 'Left',
  right: 'Right',
  up: 'Up',
  down: 'Down',
} as const satisfies Record<Direction, string>

/** The note under a transition setting, saying the board draws it and never the file. */
export function TransitionNote() {
  return (
    <p className="mt-1.5 text-caption text-muted-foreground">
      Drawn by the board while presenting. Slide files are unchanged.
    </p>
  )
}

/**
 * The open page's settings, shown with nothing selected: the transition
 * present mode draws between its slides, its direction for Slide and Push,
 * and its length. Each pick writes the page's `layout.json` in one undo
 * step, keeping the other two as they stand.
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
      <h2 id="inspector-page" className="mb-2 text-xs font-semibold">
        Page
      </h2>
      <Setting title="Slide transition">
        <TypePicker
          label="Slide transition"
          shown={transitionLabel(name)}
          current={name}
          options={TRANSITIONS.map((value) => ({
            value,
            name: transitionLabel(value),
          }))}
          disabled={!canWrite}
          onPick={(value) => {
            const picked = TRANSITIONS.find((candidate) => candidate === value)
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
      <TransitionNote />
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
