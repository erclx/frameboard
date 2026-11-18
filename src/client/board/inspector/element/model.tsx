import { useRef } from 'react'

import type { ModelReading, ModelStage } from '@/shared/frame-bridge/model'

import {
  type LiveModel,
  stageAndWrite,
  type WriteStaged,
} from '../../element/model'
import {
  type Angle,
  angleOf,
  fileName,
  orbitStages,
  scaleOf,
  scaleStage,
  type Turn,
  turnOf,
  turnStage,
} from '../../element/model-staging'
import { type NumberChange, NumberField } from '../number-field'
import { SwitchRow } from './switch-row'
import { TypePicker } from './typography'

const DEGREES: Intl.NumberFormatOptions = {
  style: 'unit',
  unit: 'degree',
  unitDisplay: 'narrow',
  maximumFractionDigits: 2,
}
const RATIO: Intl.NumberFormatOptions = { maximumFractionDigits: 2 }

const CAPTION =
  'mb-[3px] ml-0.5 block text-(length:--text-caption) text-muted-foreground'

interface ModelSectionProps {
  model: LiveModel
  disabled: boolean
  /** Writes what the live viewer already shows, so it should skip the reload. */
  write: WriteStaged
}

/**
 * The Model section for a selected viewer. Every control writes an attribute
 * on the viewer and shows it on the live page first, and the angle writes its
 * reach beside it, since the viewer holds a camera inside `max-camera-orbit`.
 */
export function ModelSection({ model, disabled, write }: ModelSectionProps) {
  const { reading } = model
  // The reading a gesture began from, since each step it previews comes back as the next one.
  const began = useRef<ModelReading | null>(null)

  const angle = angleOf(reading)
  const turn = turnOf(reading.staged.orientation)
  const scale = scaleOf(reading.staged.scale)
  const clip = reading.staged['animation-name'] ?? reading.clips[0] ?? null

  /** Puts back what `from` stated for each attribute a gesture previewed. */
  const putBack = (from: ModelReading, staged: readonly ModelStage[]) =>
    model.stage(staged.map(({ name }) => ({ name, value: from.staged[name] })))

  /** One number's preview and commit, `stages` naming what a value writes. */
  const number = (
    read: (from: ModelReading) => number,
    stages: (from: ModelReading, value: number) => ModelStage[],
  ) => ({
    onPreview: (step: NumberChange | null) => {
      const from = began.current ?? reading
      if (step) {
        began.current = from
        model.stage(stages(from, step(read(from))))
        return
      }
      began.current = null
      putBack(from, stages(from, read(from)))
    },
    onCommit: async (step: NumberChange) => {
      const from = began.current ?? reading
      began.current = null
      const was = read(from)
      const value = step(was)
      // A value landing where it started writes nothing, so an Enter on an untouched field leaves the file alone.
      if (value === was) {
        putBack(from, stages(from, was))
        return false
      }
      return stageAndWrite(model, stages(from, value), write, from.staged)
    },
  })

  const angled = (key: keyof Angle) =>
    number(
      (from) => angleOf(from)[key],
      (from, value) =>
        orbitStages(from.staged, { ...angleOf(from), [key]: value }),
    )
  const turned = (key: keyof Turn) =>
    number(
      (from) => turnOf(from.staged.orientation)[key],
      (from, value) => [
        turnStage({ ...turnOf(from.staged.orientation), [key]: value }),
      ],
    )
  const scaled = number(
    // Axes that differ take one number from 1, since the field shows no one value to step from.
    (from) => scaleOf(from.staged.scale) ?? 1,
    (_from, value) => [scaleStage(value)],
  )

  return (
    <section
      aria-labelledby="inspector-model"
      className="border-b border-sidebar-border px-3 pt-2.5 pb-3"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 id="inspector-model" className="text-xs font-semibold">
          Model
        </h2>
        <span
          className="min-w-0 truncate text-muted-foreground"
          title={reading.src}
        >
          {fileName(reading.src)}
        </span>
      </div>
      <div role="group" aria-labelledby="inspector-model-angle">
        <span id="inspector-model-angle" className={CAPTION}>
          Angle
        </span>
        <div className="grid grid-cols-2 gap-1.5">
          <NumberField
            prefix="H"
            label="Angle across"
            value={angle.theta}
            min={-180}
            max={180}
            format={DEGREES}
            disabled={disabled}
            {...angled('theta')}
          />
          <NumberField
            prefix="V"
            label="Angle down"
            value={angle.phi}
            min={0}
            max={180}
            format={DEGREES}
            disabled={disabled}
            {...angled('phi')}
          />
        </div>
      </div>
      <div
        role="group"
        aria-labelledby="inspector-model-rotation"
        className="mt-1.5"
      >
        <span id="inspector-model-rotation" className={CAPTION}>
          Rotation
        </span>
        <div className="grid grid-cols-3 gap-1.5">
          <NumberField
            prefix="X"
            label="Rotation X"
            value={turn.x}
            format={DEGREES}
            disabled={disabled}
            {...turned('x')}
          />
          <NumberField
            prefix="Y"
            label="Rotation Y"
            value={turn.y}
            format={DEGREES}
            disabled={disabled}
            {...turned('y')}
          />
          <NumberField
            prefix="Z"
            label="Rotation Z"
            value={turn.z}
            format={DEGREES}
            disabled={disabled}
            {...turned('z')}
          />
        </div>
      </div>
      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
        <NumberField
          label="Scale"
          caption="Scale"
          value={scale}
          step={0.1}
          min={0.01}
          format={RATIO}
          disabled={disabled}
          {...scaled}
        />
        <div className="min-w-0">
          <span className={CAPTION}>Animation</span>
          <TypePicker
            label="Animation"
            className="w-full"
            shown={clip ?? 'None'}
            current={clip}
            options={reading.clips.map((name) => ({ name, value: name }))}
            // A model with no clip has nothing to pick.
            disabled={disabled || reading.clips.length === 0}
            onPick={(name) =>
              void stageAndWrite(
                model,
                [{ name: 'animation-name', value: name }],
                write,
              )
            }
          />
        </div>
      </div>
      <SwitchRow
        className="mt-1.5 h-6"
        label="Autoplay"
        on={reading.staged.autoplay !== null}
        disabled={disabled}
        onTurn={() =>
          void stageAndWrite(
            model,
            [
              {
                name: 'autoplay',
                value: reading.staged.autoplay === null ? '' : null,
              },
            ],
            write,
          )
        }
      />
    </section>
  )
}
