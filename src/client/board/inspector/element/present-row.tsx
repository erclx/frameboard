import { ChevronRight } from 'lucide-react'

import { type StepAttributes, stepOf } from '@/shared/present-steps'
import { STEP_EFFECT_LABELS } from '@/shared/present-transition'

import { inspectorTabId, inspectorTabStore } from '../tab-store'

/** The element's step as one row on the Design tab, which opens the Slides tab where it is set. */
export function PresentRow({ step }: { step: StepAttributes }) {
  const held = stepOf('', step)
  const shown = held
    ? `Step ${held.number}, ${STEP_EFFECT_LABELS[held.effect]}`
    : 'Not a step'
  return (
    <section
      aria-labelledby="inspector-present-row"
      className="border-b border-sidebar-border px-3 pt-2.5 pb-3"
    >
      <h2 id="inspector-present-row" className="mb-2 text-xs font-semibold">
        Present
      </h2>
      <button
        type="button"
        aria-label={`${shown}, open in Slides`}
        onClick={(event) => {
          inspectorTabStore.setState({ tab: 'slides' })
          // This row leaves with its tab, so the focus goes to the tab it opened, unringed after a pointer.
          document
            .getElementById(inspectorTabId('slides'))
            ?.focus({ focusVisible: event.detail === 0 })
        }}
        className="flex h-[26px] w-full items-center justify-between gap-2 rounded-md bg-input px-2 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="truncate">{shown}</span>
        <ChevronRight
          aria-hidden
          className="size-3 shrink-0 text-muted-foreground"
        />
      </button>
    </section>
  )
}
