import type { StyleValue } from '@/shared/records/elements'
import type { TokenRow } from '@/shared/records/tokens'
import type { Theme } from '@/shared/theme'

import { ColorRow } from './color-row'
import { ColorSection } from './fill'
import type { PreviewStyle, WriteElement } from './write'

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
 * border. `+` writes `border: 1px solid var(--border)`, else the first color
 * token, else a raw grey, matching the 1px stroke Figma adds. Remove drops the element's own
 * `border` and its longhands, or writes `border-style: none` over a rule's.
 * The width has no control and stays the agent's.
 */
export function StrokeSection({
  bordered,
  borderColor,
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
                : { kind: 'style', property: 'border-style', value: 'none' },
            )
          }
        />
      ) : null}
    </ColorSection>
  )
}
