import type { StyleValue } from '@/shared/records/elements'
import type { TokenRow } from '@/shared/records/tokens'
import type { Theme } from '@/shared/theme'

import { NumberField } from '../number-field'
import { ColorRow } from './color-row'
import { ColorSection } from './fill'
import { type PreviewStyle, styleNumber, type WriteElement } from './write'

/** A stroke width keeps two places, so a 0.5px hairline reads as written. */
const WIDTH: Intl.NumberFormatOptions = { maximumFractionDigits: 2 }

/**
 * The thinnest width the field writes, since a 0 width hides the row while
 * the declaration stays, leaving remove to drop a stroke.
 */
const MIN_WIDTH = 1

/** The token the stroke `+` reaches for first. */
const BORDER_TOKEN = '--border'

/**
 * The stroke `+` writes where the project names no color token: a mid grey
 * reading on a light and a dark frame alike, and a hex rather than
 * `currentcolor` so the row's opacity field stays live.
 */
const TOKENLESS_STROKE = '#808080'

interface StrokeSectionProps {
  /** Whether the element draws a border, which shows the row. */
  bordered: boolean
  borderColor: StyleValue | null
  /**
   * The border width in px, null where the sides differ, which reads
   * `Mixed`. Absent shows no width field.
   */
  borderWidth?: number | null
  tokens: readonly TokenRow[]
  theme: Theme
  /** Whether the element's own `style` sets any border, which remove drops. */
  inline: boolean
  disabled: boolean
  write: WriteElement
  /** Shows a picked color on the live element before it is written. */
  preview?: PreviewStyle
  /** The element's text color, which a `currentcolor` paint shows. */
  currentColor?: string
}

/**
 * Stroke: one color row writing `border-color` while the element draws a
 * border, and beside it a width field writing `border-width` for all four
 * sides. `+` writes `border: 1px solid var(--border)`, else the first color
 * token, else a raw grey, matching the 1px stroke Figma adds. Remove drops the element's own
 * `border` and its longhands, or writes `border-style: none` over a rule's.
 */
export function StrokeSection({
  bordered,
  borderColor,
  borderWidth,
  tokens,
  theme,
  inline,
  disabled,
  write,
  preview,
  currentColor,
}: StrokeSectionProps) {
  const token =
    tokens.find((row) => row.name === BORDER_TOKEN)?.name ?? tokens[0]?.name
  // A border drawn in the current color states none, which the row shows as that.
  const value: StyleValue | null = bordered
    ? (borderColor ?? { value: 'currentcolor', token: null, percent: 100 })
    : null
  return (
    <ColorSection
      title="Stroke"
      add={{
        label: 'Add stroke',
        disabled: disabled || bordered,
        onAdd: () => {
          void write({
            kind: 'style',
            property: 'border',
            value: `1px solid ${token === undefined ? TOKENLESS_STROKE : `var(${token})`}`,
          })
        },
      }}
    >
      {value ? (
        <div className="flex items-center gap-1.5">
          <div className="min-w-0 flex-1">
            <ColorRow
              label="Stroke"
              value={value}
              tokens={tokens}
              theme={theme}
              disabled={disabled}
              onWrite={(css) =>
                write({ kind: 'style', property: 'border-color', value: css })
              }
              onPreview={(css) => preview?.('border-color', css)}
              currentColor={currentColor}
              onRemove={() =>
                void write(
                  inline
                    ? { kind: 'style', property: 'border', value: '' }
                    : {
                        kind: 'style',
                        property: 'border-style',
                        value: 'none',
                      },
                )
              }
            />
          </div>
          {borderWidth === undefined ? null : (
            <NumberField
              label="Stroke width"
              prefix="W"
              className="w-[58px] shrink-0"
              value={borderWidth}
              min={MIN_WIDTH}
              format={WIDTH}
              disabled={disabled}
              {...styleNumber(
                'border-width',
                borderWidth ?? MIN_WIDTH,
                (width) => `${Math.max(MIN_WIDTH, width)}px`,
                write,
                preview,
              )}
            />
          )}
        </div>
      ) : null}
    </ColorSection>
  )
}
