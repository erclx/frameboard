import { useState } from 'react'

import { Input } from '@/client/components/ui/input'
import {
  STEP_ATTRIBUTES,
  STEP_EFFECT_LABELS,
  STEP_EFFECTS,
  STEP_START_LABELS,
  STEP_STARTS,
  type StepEffect,
  type StepStart,
} from '@/shared/present-transition'

import { TypePicker } from './typography'
import type { WriteElement } from './write'

/** The element's step attributes as its file holds them, each null where absent. */
export interface LiveStep {
  step: string | null
  effect: string | null
  start: string | null
}

interface StepSectionProps {
  step: LiveStep
  disabled: boolean
  write: WriteElement
}

/** A typed step number, null for an empty field, undefined for anything else a field can hold. */
function parseStep(value: string): number | null | undefined {
  const trimmed = value.trim()
  if (trimmed === '') return null
  if (!/^\d+$/.test(trimmed)) return undefined
  const number = Number(trimmed)
  return number > 0 ? number : undefined
}

/**
 * The Present section: which press of its slide reveals the element. Each
 * field writes its own attribute, `data-step`, `data-step-effect`, or
 * `data-step-start`, and an empty step drops `data-step`, which takes the
 * element out of the slide's steps whatever else it holds. Effect and Start
 * show once the element holds a step.
 */
export function StepSection({ step, disabled, write }: StepSectionProps) {
  const effect: StepEffect =
    STEP_EFFECTS.find((candidate) => candidate === step.effect) ?? 'appear'
  const start: StepStart =
    STEP_STARTS.find((candidate) => candidate === step.start) ?? 'click'
  return (
    <section
      aria-labelledby="inspector-step"
      className="border-b border-sidebar-border px-3 pt-2.5 pb-3"
    >
      <h2 id="inspector-step" className="mb-2 text-xs font-semibold">
        Present
      </h2>
      <StepField
        key={step.step ?? ''}
        stored={step.step ?? ''}
        disabled={disabled}
        onCommit={(number) =>
          void write(
            number === null
              ? { kind: 'attribute', name: STEP_ATTRIBUTES.step, remove: true }
              : {
                  kind: 'attribute',
                  name: STEP_ATTRIBUTES.step,
                  value: String(number),
                },
          )
        }
      />
      {step.step === null ? null : (
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <TypePicker
            label="Effect"
            shown={STEP_EFFECT_LABELS[effect]}
            current={effect}
            options={STEP_EFFECTS.map((value) => ({
              value,
              name: STEP_EFFECT_LABELS[value],
            }))}
            disabled={disabled}
            onPick={(value) =>
              void write({
                kind: 'attribute',
                name: STEP_ATTRIBUTES.effect,
                value,
              })
            }
          />
          <TypePicker
            label="Start"
            shown={STEP_START_LABELS[start]}
            current={start}
            options={STEP_STARTS.map((value) => ({
              value,
              name: STEP_START_LABELS[value],
            }))}
            disabled={disabled}
            onPick={(value) =>
              void write({
                kind: 'attribute',
                name: STEP_ATTRIBUTES.start,
                value,
              })
            }
          />
        </div>
      )}
      <p className="mt-1.5 text-caption text-muted-foreground">
        Shown on that press while presenting. Edit mode and export show every
        step.
      </p>
    </section>
  )
}

/**
 * The step number as typed, written on Enter or blur. An empty field drops
 * the step, and anything but a positive whole number puts the stored value
 * back. Keyed by the stored value, so an undo or an agent's write resets it.
 */
function StepField({
  stored,
  disabled,
  onCommit,
}: {
  stored: string
  disabled: boolean
  onCommit: (number: number | null) => void
}) {
  const [typed, setTyped] = useState(stored)
  const invalid = parseStep(typed) === undefined
  const commit = () => {
    const number = parseStep(typed)
    if (number === undefined) {
      setTyped(stored)
      return
    }
    if (String(number ?? '') !== stored.trim()) onCommit(number)
  }
  return (
    <label className="flex flex-col gap-1">
      <span className="text-caption text-muted-foreground">
        Appears on step
      </span>
      <Input
        inputMode="numeric"
        placeholder="Always shown"
        value={typed}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        onChange={(event) => setTyped(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit()
          if (event.key === 'Escape') setTyped(stored)
        }}
      />
    </label>
  )
}
