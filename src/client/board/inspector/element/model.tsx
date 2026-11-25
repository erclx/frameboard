import { Kbd } from '@/client/components/ui/kbd'

import {
  type LiveModel,
  stageAndWrite,
  type WriteStaged,
} from '../../element/model'
import { type Angle, angleOf, orbitStages } from '../../element/model-staging'
import { NumberField } from '../number-field'
import { stagedNumber, useModelNumber } from './model-number'
import { SwitchRow } from './switch-row'
import { TypePicker } from './typography'

const DEGREES: Intl.NumberFormatOptions = {
  style: 'unit',
  unit: 'degree',
  unitDisplay: 'narrow',
  maximumFractionDigits: 2,
}

/** Clears a word prefix such as Around, where the default clears one letter. */
const WORD_INSET = 'pl-[58px]'

const CAPTION =
  'mb-[3px] ml-0.5 block text-(length:--text-caption) text-muted-foreground'

interface CameraSectionProps {
  model: LiveModel
  disabled: boolean
  /** Writes what the live viewer already shows, so it should skip the reload. */
  write: WriteStaged
}

/**
 * The Camera section for a selected model, where the page looks from over
 * the clip it plays. An angle writes its reach beside it, since the viewer
 * holds a camera inside `max-camera-orbit`.
 */
export function CameraSection({ model, disabled, write }: CameraSectionProps) {
  const { reading } = model
  const number = useModelNumber(model)
  const angle = angleOf(reading)
  const clip = reading.staged['animation-name'] ?? reading.clips[0] ?? null
  const angled = (key: keyof Angle) =>
    number(
      stagedNumber(
        model,
        write,
        (from) => angleOf(from)[key],
        (from, value) =>
          orbitStages(from.staged, { ...angleOf(from), [key]: value }),
      ),
    )

  // A file with no clip drops the count rather than reading zero beside an off list.
  const clipCaption =
    reading.clips.length === 0
      ? 'Clip in this file'
      : `Clip in this file · ${reading.clips.length}`

  return (
    <section
      aria-labelledby="inspector-camera"
      className="border-b border-sidebar-border px-3 pt-2.5 pb-3"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 id="inspector-camera" className="text-xs font-semibold">
          Camera
        </h2>
        <span className="text-muted-foreground">where you look from</span>
      </div>
      <p className="mb-2 rounded-md bg-muted px-2 py-1.5 text-(length:--text-caption) leading-snug text-muted-foreground">
        <b className="font-semibold text-foreground">Double-click</b> the model
        to turn it by hand.{' '}
        <Kbd className="h-4 bg-background text-[10px] text-foreground ring-1 ring-border">
          Esc
        </Kbd>{' '}
        leaves.
      </p>
      <div className="grid grid-cols-2 gap-1.5">
        <NumberField
          prefix="Around"
          inset={WORD_INSET}
          label="Camera around"
          value={angle.theta}
          min={-180}
          max={180}
          format={DEGREES}
          disabled={disabled}
          {...angled('theta')}
        />
        <NumberField
          prefix="Height"
          inset={WORD_INSET}
          label="Camera height"
          value={angle.phi}
          min={0}
          max={180}
          format={DEGREES}
          disabled={disabled}
          {...angled('phi')}
        />
      </div>
      <div className="mt-1.5">
        <span className={CAPTION}>{clipCaption}</span>
        <TypePicker
          label="Clip"
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
      <SwitchRow
        className="mt-1.5 h-6"
        label="Play on load"
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
