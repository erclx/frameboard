import { type KeyboardEvent, useRef, useState } from 'react'

import { Input } from '@/client/components/ui/input'
import { cn } from '@/client/lib/cn'
import type { StepAttributes } from '@/shared/present-steps'
import {
  STEP_ATTRIBUTES,
  STEP_EFFECT_LABELS,
  STEP_EFFECTS,
  STEP_START_LABELS,
  STEP_STARTS,
  type StepEffect,
  type StepStart,
} from '@/shared/present-transition'

import { EditKeyframes } from '../../present/transition'
import { EffectTiles } from '../effect-tiles'
import { LabelTip } from '../label-tip'
import type { WriteElement } from './write'

interface StepSectionProps {
  step: StepAttributes
  disabled: boolean
  write: WriteElement
  /** Plays an effect once on the element, on a tile's hover or focus. */
  onPreview?: (effect: StepEffect) => void
  onPreviewEnd?: () => void
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
export function StepSection({
  step,
  disabled,
  write,
  onPreview,
  onPreviewEnd,
}: StepSectionProps) {
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
        <>
          <span
            id="inspector-step-effect"
            className="mt-2 mb-1 block text-caption text-muted-foreground"
          >
            Effect
          </span>
          <EditKeyframes project={undefined} />
          <EffectTiles
            labelledBy="inspector-step-effect"
            options={STEP_EFFECTS.map((value) => ({
              value,
              label: STEP_EFFECT_LABELS[value],
              picture: { kind: 'step', effect: value },
            }))}
            current={effect}
            columns={5}
            disabled={disabled}
            onPick={(value) =>
              void write({
                kind: 'attribute',
                name: STEP_ATTRIBUTES.effect,
                value,
              })
            }
            onPreview={(value) => {
              const picked = STEP_EFFECTS.find(
                (candidate) => candidate === value,
              )
              if (picked) onPreview?.(picked)
            }}
            onPreviewEnd={onPreviewEnd}
          />
          <span
            id="inspector-step-start"
            className="mt-2 mb-1 block text-caption text-muted-foreground"
          >
            Starts
          </span>
          <StartButtons
            current={start}
            disabled={disabled}
            onPick={(value) =>
              void write({
                kind: 'attribute',
                name: STEP_ATTRIBUTES.start,
                value,
              })
            }
          />
        </>
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

/** The radio group's arrow keys, each moving one button along and picking it. */
const ARROW_STEPS: Readonly<Record<string, number>> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
}

/** When the step starts, as three buttons picked like a radio group. */
function StartButtons({
  current,
  disabled,
  onPick,
}: {
  current: StepStart
  disabled: boolean
  onPick: (value: StepStart) => void
}) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const pick = (value: StepStart) => {
    if (value !== current) onPick(value)
  }
  const step = (event: KeyboardEvent, index: number) => {
    const by = ARROW_STEPS[event.key]
    if (by === undefined) return
    event.preventDefault()
    const next = (index + by + STEP_STARTS.length) % STEP_STARTS.length
    const target = STEP_STARTS[next]
    if (!target) return
    buttons.current[next]?.focus()
    pick(target)
  }
  return (
    <div
      role="radiogroup"
      aria-labelledby="inspector-step-start"
      className="flex h-[26px] gap-0.5 rounded-md bg-input p-0.5"
    >
      {STEP_STARTS.map((value, index) => (
        <button
          key={value}
          ref={(button) => {
            buttons.current[index] = button
          }}
          type="button"
          role="radio"
          aria-checked={value === current}
          tabIndex={value === current ? 0 : -1}
          disabled={disabled}
          onClick={() => pick(value)}
          onKeyDown={(event) => step(event, index)}
          className={cn(
            'grid min-w-0 flex-1 place-items-center truncate rounded-[5px] text-caption text-muted-foreground outline-none hover:bg-sidebar hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 active:bg-sidebar disabled:pointer-events-none disabled:opacity-40',
            value === current &&
              'bg-sidebar font-semibold text-foreground shadow-xs',
          )}
        >
          {STEP_START_LABELS[value]}
        </button>
      ))}
    </div>
  )
}
