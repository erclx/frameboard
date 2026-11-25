import { Link2, Unlink2 } from 'lucide-react'
import { useStore } from 'zustand'

import type { Placement } from '@/shared/frame-bridge/live-element'
import type {
  Axes,
  ModelReading,
  ModelTransform,
} from '@/shared/frame-bridge/model'

import { ActionTooltip } from '../../chrome/action-tooltip'
import {
  holdAndWrite,
  type LiveModel,
  unpreview,
  type WriteStaged,
} from '../../element/model'
import {
  handlesStore,
  isLinked,
  setLinked,
} from '../../element/model-handles/store'
import {
  depthOf,
  SCALE_MIN,
  scaledTo,
  scaleOf,
  transformOf,
  turnOf,
  turnStage,
} from '../../element/model-staging'
import type { FreeSpot } from '../../place/write'
import type { ElementKey } from '../../selection'
import { NumberField } from '../number-field'
import { type ModelNumber, stagedNumber, useModelNumber } from './model-number'
import { OffsetField, PlacementSwitch } from './position'
import type { PreviewStyle, WriteElement } from './write'

const DEGREES: Intl.NumberFormatOptions = {
  style: 'unit',
  unit: 'degree',
  unitDisplay: 'narrow',
  maximumFractionDigits: 2,
}
const HUNDREDTHS: Intl.NumberFormatOptions = { maximumFractionDigits: 2 }

const CAPTION =
  'mb-[3px] ml-0.5 block text-(length:--text-caption) text-muted-foreground'

const AXES = [
  ['x', 'X'],
  ['y', 'Y'],
  ['z', 'Z'],
] as const satisfies readonly (readonly [keyof Axes, string])[]

interface TransformSectionProps {
  element: Pick<ElementKey, 'frame' | 'index'>
  model: LiveModel
  placement: Placement
  disabled: boolean
  /** Writes an offset of a placed model, as any other declaration. */
  write: WriteElement
  /** Writes what the live viewer already shows, so it should skip the reload. */
  writeStaged: WriteStaged
  /** Shows a step on the live element before it is written. */
  preview?: PreviewStyle
  /** Places the model at a spot, or back in the flow on null, as one step. */
  place: (spot: FreeSpot | null) => Promise<boolean>
}

/**
 * The Transform section for a selected model. A size or a depth writes the
 * camera's distance and view beside it, so a load draws what the page showed.
 */
export function TransformSection({
  element,
  model,
  placement,
  disabled,
  write,
  writeStaged,
  preview,
  place,
}: TransformSectionProps) {
  const { reading } = model
  const number = useModelNumber(model)
  const links = useStore(handlesStore, (state) => state.links)
  const scale = scaleOf(reading.staged.scale)
  const turn = turnOf(reading.staged.orientation)
  const linked = isLinked(links, element, scale)
  // A size and a depth are held against a drawn camera, which a missing file never has.
  const undrawn = disabled || !reading.loaded || !reading.bounds

  const turned = (axis: keyof Axes) =>
    number(
      stagedNumber(
        model,
        writeStaged,
        (from) => turnOf(from.staged.orientation)[axis],
        (from, value) => [
          turnStage({ ...turnOf(from.staged.orientation), [axis]: value }),
        ],
      ),
    )
  const held = (
    read: ModelNumber['read'],
    to: (from: ModelReading, value: number) => ModelTransform,
  ) =>
    number({
      read,
      show: (from, value) => model.preview(to(from, value)),
      putBack: (from) => unpreview(model, from),
      write: (from, value) =>
        holdAndWrite(model, to(from, value), writeStaged, from),
    })
  const scaled = (axis: keyof Axes) =>
    held(
      (from) => scaleOf(from.staged.scale)[axis],
      (from, value) => ({
        ...transformOf(from),
        scale: scaledTo(scaleOf(from.staged.scale), axis, value, linked),
      }),
    )

  const Chain = linked ? Link2 : Unlink2
  const state = linked ? 'linked' : 'unlinked'

  return (
    <section
      aria-labelledby="inspector-transform"
      className="border-b border-sidebar-border px-3 pt-2.5 pb-3"
    >
      <div className="mb-1.5 flex items-center justify-between">
        <h2 id="inspector-transform" className="text-xs font-semibold">
          Transform
        </h2>
        <PlacementSwitch
          placement={placement}
          disabled={disabled}
          place={place}
        />
      </div>
      <div role="group" aria-labelledby="inspector-transform-position">
        <span id="inspector-transform-position" className={CAPTION}>
          Position
        </span>
        <div className="grid grid-cols-3 gap-1.5">
          <OffsetField
            side="left"
            placement={placement}
            disabled={disabled || !placement.free}
            write={write}
            preview={preview}
          />
          <OffsetField
            side="top"
            placement={placement}
            disabled={disabled || !placement.free}
            write={write}
            preview={preview}
          />
          <NumberField
            prefix="Z"
            label="Z, meters nearer in its scene"
            value={depthOf(reading)}
            empty=""
            step={0.1}
            format={HUNDREDTHS}
            disabled={undrawn}
            {...held(
              (from) => depthOf(from) ?? 0,
              (from, depth) => ({ ...transformOf(from), depth }),
            )}
          />
        </div>
      </div>
      <div
        role="group"
        aria-labelledby="inspector-transform-rotation"
        className="mt-1.5"
      >
        <span id="inspector-transform-rotation" className={CAPTION}>
          Rotation
        </span>
        <div className="grid grid-cols-3 gap-1.5">
          {AXES.map(([axis, letter]) => (
            <NumberField
              key={axis}
              prefix={letter}
              label={`Rotation ${letter}`}
              value={turn[axis]}
              format={DEGREES}
              disabled={disabled}
              {...turned(axis)}
            />
          ))}
        </div>
      </div>
      <div
        role="group"
        aria-labelledby="inspector-transform-scale"
        className="mt-1.5"
      >
        <div className="flex items-start justify-between">
          <span id="inspector-transform-scale" className={CAPTION}>
            Scale
          </span>
          <ActionTooltip
            label={
              linked ? 'Size each axis on its own' : 'Size every axis together'
            }
          >
            <button
              type="button"
              aria-label={`Scale ${state}`}
              disabled={disabled}
              onClick={() => setLinked(element, !linked)}
              className="relative flex items-center gap-1 rounded-[4px] px-0.5 text-(length:--text-caption) text-muted-foreground outline-none after:absolute after:inset-x-0 after:-inset-y-1.5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
            >
              <Chain aria-hidden className="size-3" />
              {state}
            </button>
          </ActionTooltip>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {AXES.map(([axis, letter]) => (
            <NumberField
              key={axis}
              prefix={letter}
              label={`Scale ${letter}`}
              value={scale[axis]}
              step={0.1}
              min={SCALE_MIN}
              format={HUNDREDTHS}
              disabled={undrawn}
              {...scaled(axis)}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
