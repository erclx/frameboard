import { Plus } from 'lucide-react'
import type { ReactNode } from 'react'

import type { StyleValue } from '@/shared/records/elements'
import type { TokenRow } from '@/shared/records/tokens'
import type { Theme } from '@/shared/theme'

import { ColorRow } from './color-row'
import type { PreviewStyle, WriteElement } from './write'

interface ColorSectionProps {
  title: string
  /** Labels the `+`, which is disabled while it has nothing to add. */
  add: { label: string; disabled: boolean; onAdd: () => void }
  children: ReactNode
}

/** A section headed by its title and a `+`, as Fill and Stroke draw it. */
export function ColorSection({ title, add, children }: ColorSectionProps) {
  const id = `inspector-${title.toLowerCase()}`
  return (
    <section
      aria-labelledby={id}
      className="border-b border-sidebar-border px-3 pt-2.5 pb-3"
    >
      <div className="flex items-center justify-between">
        <h2 id={id} className="text-xs font-semibold">
          {title}
        </h2>
        <button
          type="button"
          aria-label={add.label}
          disabled={add.disabled}
          onClick={add.onAdd}
          className="grid size-5 place-items-center rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
        >
          <Plus aria-hidden className="size-[13px]" />
        </button>
      </div>
      {children ? <div className="mt-2">{children}</div> : null}
    </section>
  )
}

interface FillSectionProps {
  /** True for an element holding text alone, whose fill is its text color, as in Figma. */
  textOnly: boolean
  color: StyleValue | null
  backgroundColor: StyleValue | null
  /** The project's color tokens. */
  tokens: readonly TokenRow[]
  theme: Theme
  /** Whether the element's own `style` sets the fill, which remove drops. */
  inline: boolean
  disabled: boolean
  write: WriteElement
  /** Shows a picked color on the live element before it is written. */
  preview?: PreviewStyle
  /** The element's text color, which a `currentcolor` paint shows. */
  currentColor?: string
}

/**
 * Fill: one color row writing `color` on an element holding text alone and
 * `background-color` otherwise. `+` adds the project's first color token
 * while nothing sets one, and a transparent background reads as none.
 * Remove drops the element's own fill, or writes `transparent` over a
 * rule's background, and a rule's text color has no remove.
 */
export function FillSection({
  textOnly,
  color,
  backgroundColor,
  tokens,
  theme,
  inline,
  disabled,
  write,
  preview,
  currentColor,
}: FillSectionProps) {
  const property = textOnly ? 'color' : 'background-color'
  const stated = textOnly ? color : backgroundColor
  const value =
    stated && stated.value.trim().toLowerCase() !== 'transparent'
      ? stated
      : null
  const first = tokens[0]
  const set = (css: string) => write({ kind: 'style', property, value: css })
  const remove = inline
    ? () => void set('')
    : textOnly
      ? undefined
      : () => void set('transparent')
  return (
    <ColorSection
      title="Fill"
      add={{
        label: 'Add fill',
        disabled: disabled || value !== null || !first,
        onAdd: () => {
          if (first) void set(`var(${first.name})`)
        },
      }}
    >
      {value ? (
        <ColorRow
          label="Fill"
          value={value}
          tokens={tokens}
          theme={theme}
          disabled={disabled}
          onWrite={set}
          onRemove={remove}
          onPreview={(css) => preview?.(property, css)}
          currentColor={currentColor}
        />
      ) : null}
    </ColorSection>
  )
}
