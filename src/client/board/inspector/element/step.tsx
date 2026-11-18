import { useState } from 'react'

import { Input } from '@/client/components/ui/input'
import type { LiveStep } from '@/shared/frame-bridge/live-element'
import {
  STEP_ATTRIBUTES,
  STEP_EFFECT_LABELS,
  STEP_EFFECTS,
  STEP_START_LABELS,
  STEP_STARTS,
  type StepEffect,
  type StepStart,
} from '@/shared/present-transition'

import { LabelTip } from '../label-tip'
import { TypePicker } from './typography'
import type { WriteElement } from './write'

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
 * Which press of its slide reveals the element. An empty step drops
 * `data-step`, which takes the element out of the steps whatever else it holds.
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
    <div className="flex flex-col gap-1">
      <LabelTip
        label="Appears on step"
        tip="Shown on that press while presenting. Edit mode and export show every step."
        tipId="inspector-step-tip"
      >
        <label
          htmlFor="inspector-step-field"
          className="text-caption text-muted-foreground"
        >
          Appears on step
        </label>
      </LabelTip>
      <Input
        id="inspector-step-field"
        aria-describedby="inspector-step-tip"
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
    </div>
  )
}
