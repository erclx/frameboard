import { Circle, Square } from 'lucide-react'

import { CommitField } from './field'
import { parsePercent, parseWhole } from './values'
import type { WriteElement } from './write'

interface LayerSectionProps {
  /** The layer name, being `data-name` or the one the tree derives. */
  name: string
  /** From 0 to 1, as the browser computed it. */
  opacity: number
  /** The corner radius in px. */
  radius: number
  disabled: boolean
  write: WriteElement
}

/**
 * The Element section of `inspector/text`: the layer name, written as
 * `data-name`, the opacity as a percent, and the corner radius in px. An
 * empty name writes `data-name` empty, so the layer falls back to its
 * derived name.
 */
export function LayerSection({
  name,
  opacity,
  radius,
  disabled,
  write,
}: LayerSectionProps) {
  return (
    <section
      aria-labelledby="inspector-element"
      className="border-b border-sidebar-border px-3 pt-2.5 pb-3"
    >
      <h2 id="inspector-element" className="mb-2 text-xs font-semibold">
        Element
      </h2>
      <CommitField
        label="Name"
        className="mb-1.5"
        shown={name}
        disabled={disabled}
        onCommit={(typed) =>
          write({ kind: 'attribute', name: 'data-name', value: typed })
        }
      />
      <div className="grid grid-cols-2 gap-1.5">
        <CommitField
          label="Opacity"
          prefix={<Circle className="size-1.5 fill-current" />}
          inset="pl-[28px]"
          shown={`${Math.round(opacity * 100)}%`}
          disabled={disabled}
          onCommit={async (typed) => {
            const percent = parsePercent(typed)
            if (percent === null) return false
            return write({
              kind: 'style',
              property: 'opacity',
              value: String(percent / 100),
            })
          }}
        />
        <CommitField
          label="Corner radius"
          prefix={<Square className="size-3" />}
          inset="pl-[28px]"
          shown={String(radius)}
          disabled={disabled}
          onCommit={async (typed) => {
            const px = parseWhole(typed, 'px')
            if (px === null) return false
            return write({
              kind: 'style',
              property: 'border-radius',
              value: `${px}px`,
            })
          }}
        />
      </div>
    </section>
  )
}
