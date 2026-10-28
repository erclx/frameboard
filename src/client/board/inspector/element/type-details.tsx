import { cn } from 'cn'
import {
  CaseLower,
  CaseSensitive,
  CaseUpper,
  ChevronDown,
  Ellipsis,
  type LucideIcon,
  Minus,
  Settings2,
  Strikethrough,
  Underline,
} from 'lucide-react'
import { type KeyboardEvent, type ReactNode, useRef } from 'react'

import {
  DropdownMenu,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/client/components/ui/dropdown-menu'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/client/components/ui/popover'

import { ActionTooltip } from '../../chrome/action-tooltip'
import { ChromeMenuContent, MENU_ROW } from '../../chrome/menu'
import type { LiveElement } from './styles'
import type { WriteElement } from './write'

/** What the Type details rows light, as the live element computes it. */
export type TypeDetails = Pick<
  LiveElement,
  | 'textDecorationLine'
  | 'textTransform'
  | 'textWrapStyle'
  | 'truncated'
  | 'display'
>

export interface Segment {
  value: string
  label: string
  icon: LucideIcon
}

const DECORATIONS: readonly Segment[] = [
  { value: 'none', label: 'No decoration', icon: Minus },
  { value: 'underline', label: 'Underline', icon: Underline },
  { value: 'line-through', label: 'Strikethrough', icon: Strikethrough },
]

const CASES: readonly Segment[] = [
  { value: 'none', label: 'No case', icon: Minus },
  { value: 'uppercase', label: 'Uppercase', icon: CaseUpper },
  { value: 'lowercase', label: 'Lowercase', icon: CaseLower },
  { value: 'capitalize', label: 'Title case', icon: CaseSensitive },
]

const TRUNCATIONS: readonly Segment[] = [
  { value: 'off', label: 'No truncation', icon: Minus },
  { value: 'on', label: 'Truncate text', icon: Ellipsis },
]

/**
 * One-line truncation takes all three declarations, and turning it off
 * writes each back rather than dropping it, so a frame rule setting one of
 * them cannot show through. It writes the `text-wrap-mode` longhand, so a
 * frame's whitespace collapsing stays as it was.
 */
const TRUNCATE = {
  on: [
    { property: 'overflow', value: 'hidden' },
    { property: 'text-wrap-mode', value: 'nowrap' },
    { property: 'text-overflow', value: 'ellipsis' },
  ],
  off: [
    { property: 'overflow', value: 'visible' },
    { property: 'text-wrap-mode', value: 'wrap' },
    { property: 'text-overflow', value: 'clip' },
  ],
} as const

const WRAPS = [
  { value: 'auto', name: 'Auto' },
  { value: 'balance', name: 'Balance' },
  { value: 'pretty', name: 'Pretty' },
] as const

interface TypeDetailsProps {
  details: TypeDetails
  disabled: boolean
  write: WriteElement
}

/**
 * The settings button ending Typography's alignment row, opening Type
 * details: decoration, case, one-line truncation, and the wrap style, each
 * written on the selected element alone. Wrap writes the `text-wrap-style`
 * longhand, so it never undoes the `nowrap` a truncation writes.
 */
export function TypeDetailsButton({
  details,
  disabled,
  write,
}: TypeDetailsProps) {
  // Opening on the popup rather than its first button keeps that button's
  // tooltip shut, which would otherwise take the first Escape.
  const popup = useRef<HTMLDivElement>(null)
  const wrap =
    WRAPS.find(({ value }) => value === details.textWrapStyle) ?? WRAPS[0]
  return (
    <Popover>
      <ActionTooltip label="Type details">
        <PopoverTrigger
          aria-label="Type details"
          disabled={disabled}
          className="grid size-[26px] place-items-center rounded-md bg-input text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-expanded:text-foreground"
        >
          <Settings2 aria-hidden className="size-[13px]" />
        </PopoverTrigger>
      </ActionTooltip>
      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={6}
        ref={popup}
        initialFocus={popup}
        aria-label="Type details"
        className="w-60 gap-2 rounded-[10px] p-2.5 text-xs shadow-[0_12px_40px_rgba(0,0,0,.3)] ring-border"
      >
        <DetailRow id="type-details-decoration" label="Decoration">
          <Segmented
            labelledBy="type-details-decoration"
            options={DECORATIONS}
            current={details.textDecorationLine}
            disabled={disabled}
            onPick={(value) =>
              void write({
                kind: 'style',
                property: 'text-decoration-line',
                value,
              })
            }
          />
        </DetailRow>
        <DetailRow id="type-details-case" label="Case">
          <Segmented
            labelledBy="type-details-case"
            options={CASES}
            current={details.textTransform}
            disabled={disabled}
            onPick={(value) =>
              void write({ kind: 'style', property: 'text-transform', value })
            }
          />
        </DetailRow>
        <DetailRow id="type-details-truncate" label="Truncate">
          <Segmented
            labelledBy="type-details-truncate"
            options={TRUNCATIONS}
            current={details.truncated ? 'on' : 'off'}
            // `overflow` and `text-overflow` clip only a block container, and writing `display` is layout.
            disabled={disabled || details.display === 'inline'}
            onPick={(value) =>
              void write({
                kind: 'styles',
                declarations: value === 'on' ? TRUNCATE.on : TRUNCATE.off,
              })
            }
          />
        </DetailRow>
        <DetailRow id="type-details-wrap" label="Wrap">
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Wrap"
              disabled={disabled}
              className="flex h-[26px] w-24 items-center gap-1 rounded-md bg-input px-2 text-left text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
            >
              <span className="flex-1 truncate">{wrap.name}</span>
              <ChevronDown
                aria-hidden
                className="size-2.5 shrink-0 text-muted-foreground"
              />
            </DropdownMenuTrigger>
            <ChromeMenuContent
              align="end"
              sideOffset={6}
              className="w-auto min-w-(--anchor-width)"
            >
              <DropdownMenuRadioGroup
                value={wrap.value}
                onValueChange={(value: string) => {
                  if (value !== wrap.value) {
                    void write({
                      kind: 'style',
                      property: 'text-wrap-style',
                      value,
                    })
                  }
                }}
              >
                {WRAPS.map(({ value, name }) => (
                  <DropdownMenuRadioItem
                    key={value}
                    value={value}
                    closeOnClick
                    className={cn(MENU_ROW, 'pr-8')}
                  >
                    {name}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </ChromeMenuContent>
          </DropdownMenu>
        </DetailRow>
      </PopoverContent>
    </Popover>
  )
}

function DetailRow({
  id,
  label,
  children,
}: {
  id: string
  label: string
  children: ReactNode
}) {
  return (
    <div className="flex h-[26px] items-center justify-between gap-2">
      <span id={id} className="text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  )
}

interface SegmentedProps {
  /** The id of the caption naming the group. */
  labelledBy: string
  options: readonly Segment[]
  /** The value lit, matched against each option, which may match none. */
  current: string
  disabled: boolean
  /** Called for an option other than the lit one. */
  onPick: (value: string) => void
}

const STEPS: Record<string, (at: number, count: number) => number> = {
  ArrowRight: (at, count) => (at + 1) % count,
  ArrowDown: (at, count) => (at + 1) % count,
  ArrowLeft: (at, count) => (at - 1 + count) % count,
  ArrowUp: (at, count) => (at - 1 + count) % count,
  Home: () => 0,
  End: (_, count) => count - 1,
}

/**
 * A row of icon buttons, one `aria-pressed` per value, each named in a
 * tooltip. The row holds one tab stop, on the lit button or the first, and
 * the arrow keys, Home, and End move focus along it without writing.
 */
export function Segmented({
  labelledBy,
  options,
  current,
  disabled,
  onPick,
}: SegmentedProps) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  const lit = options.findIndex(({ value }) => value === current)
  const stop = lit === -1 ? 0 : lit
  const onKeyDown = (event: KeyboardEvent, at: number) => {
    const step = STEPS[event.key]
    if (!step) return
    event.preventDefault()
    buttons.current[step(at, options.length)]?.focus()
  }
  return (
    <div
      role="group"
      aria-labelledby={labelledBy}
      className="flex w-max gap-0.5 rounded-md bg-input p-0.5"
    >
      {options.map(({ value, label, icon: Icon }, at) => (
        <ActionTooltip key={value} label={label}>
          <button
            ref={(button) => {
              buttons.current[at] = button
            }}
            type="button"
            aria-label={label}
            aria-pressed={value === current}
            tabIndex={at === stop ? 0 : -1}
            disabled={disabled}
            onKeyDown={(event) => onKeyDown(event, at)}
            onClick={() => {
              if (value !== current) onPick(value)
            }}
            className={cn(
              'grid h-[22px] w-7 place-items-center rounded-[5px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50',
              value === current && 'bg-sidebar text-foreground',
            )}
          >
            <Icon aria-hidden className="size-[13px]" />
          </button>
        </ActionTooltip>
      ))}
    </div>
  )
}
