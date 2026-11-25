import { type KeyboardEvent, useRef, useState } from 'react'

import { Input } from '@/client/components/ui/input'
import { cn } from '@/client/lib/cn'
import { type StepAttributes, stepOf } from '@/shared/present-steps'
import {
  STEP_ATTRIBUTES,
  STEP_DELAY_MS,
  STEP_DURATION_MS,
  STEP_EFFECT_LABELS,
  STEP_EFFECTS,
  STEP_MS,
  STEP_START_LABELS,
  STEP_STARTS,
  type StepEffect,
  type StepStart,
} from '@/shared/present-transition'

import { EditKeyframes } from '../../present/transition'
import { EffectTiles } from '../effect-tiles'
import { LabelTip } from '../label-tip'
import { NumberField } from '../number-field'
import { SwitchRow } from './switch-row'
import type { WriteElement } from './write'

const MILLISECONDS: Intl.NumberFormatOptions = {
  style: 'unit',
  unit: 'millisecond',
  unitDisplay: 'short',
  maximumFractionDigits: 2,
}

/** What an arrow press on a time moves it by, and ten times it with Shift. */
const MS_STEP = 50

interface StepSectionProps {
  step: StepAttributes
  /** Whether the element's clip can start with its step, absent on an element that holds none. */
  clip?: 'held' | 'none'
  disabled: boolean
  write: WriteElement
  /** Plays an effect once on the element for the step's own length, on a tile's hover or focus. */
  onPreview?: (effect: StepEffect, ms: number) => void
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
 * Where the element stands among its slide's steps. An empty step drops
 * `data-step`, which takes the element out of the steps whatever else it holds.
 */
export function StepSection({
  step,
  clip,
  disabled,
  write,
  onPreview,
  onPreviewEnd,
}: StepSectionProps) {
  const effect: StepEffect =
    STEP_EFFECTS.find((candidate) => candidate === step.effect) ?? 'appear'
  const start: StepStart =
    STEP_STARTS.find((candidate) => candidate === step.start) ?? 'click'
  const held = stepOf('', step)
  const duration = held?.durationMs ?? STEP_MS
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
              if (picked) onPreview?.(picked, duration)
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
          <StepTimes
            duration={duration}
            delay={held?.delayMs ?? STEP_DELAY_MS.min}
            effect={effect}
            disabled={disabled}
            write={write}
          />
          {clip ? (
            <PlaySwitch
              on={typeof step.play === 'string'}
              clip={clip}
              disabled={disabled}
              write={write}
            />
          ) : null}
        </>
      )}
    </section>
  )
}

/**
 * How long the entrance runs and how long it waits first, each attribute
 * dropped at its resting value. Appear runs no entrance, so it holds
 * Duration off.
 */
function StepTimes({
  duration,
  delay,
  effect,
  disabled,
  write,
}: {
  duration: number
  delay: number
  effect: StepEffect
  disabled: boolean
  write: WriteElement
}) {
  const commit = (name: string, next: number, from: number, rest: number) => {
    const ms = Math.round(next)
    if (ms === from) return Promise.resolve(false)
    return write(
      ms === rest
        ? { kind: 'attribute', name, remove: true }
        : { kind: 'attribute', name, value: String(ms) },
    )
  }
  return (
    <div className="mt-2 grid grid-cols-2 gap-1.5">
      <NumberField
        label="Duration"
        caption="Duration"
        value={effect === 'appear' ? null : duration}
        empty="None"
        step={MS_STEP}
        min={STEP_DURATION_MS.min}
        max={STEP_DURATION_MS.max}
        format={MILLISECONDS}
        disabled={disabled || effect === 'appear'}
        onCommit={(change) =>
          commit(STEP_ATTRIBUTES.duration, change(duration), duration, STEP_MS)
        }
      />
      <NumberField
        label="Delay"
        caption="Delay"
        value={delay}
        step={MS_STEP}
        min={STEP_DELAY_MS.min}
        max={STEP_DELAY_MS.max}
        format={MILLISECONDS}
        disabled={disabled}
        onCommit={(change) =>
          commit(STEP_ATTRIBUTES.delay, change(delay), delay, STEP_DELAY_MS.min)
        }
      />
    </div>
  )
}

/** Whether the clip starts as the step appears, off on a model with no clip unless the file still holds it. */
function PlaySwitch({
  on,
  clip,
  disabled,
  write,
}: {
  on: boolean
  clip: 'held' | 'none'
  disabled: boolean
  write: WriteElement
}) {
  return (
    <>
      <SwitchRow
        className="mt-1.5 h-6"
        label="Play as it appears"
        on={on}
        disabled={disabled || (clip === 'none' && !on)}
        onTurn={() =>
          void write(
            on
              ? { kind: 'attribute', name: STEP_ATTRIBUTES.play, remove: true }
              : { kind: 'attribute', name: STEP_ATTRIBUTES.play, value: '' },
          )
        }
      />
      {clip === 'none' ? (
        <p className="text-caption text-muted-foreground">
          No clip in this file
        </p>
      ) : null}
    </>
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
        tip="Its place in the order a slide’s steps show while presenting. Edit mode and export show every step."
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
