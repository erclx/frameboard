import { Plus, X } from 'lucide-react'
import { Fragment, useEffect, useRef, useState } from 'react'

import {
  DropdownMenu,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/client/components/ui/dropdown-menu'
import { cn } from '@/client/lib/cn'
import type { Structure } from '@/client/live/structure'
import type { FrameRecord } from '@/shared/records/list'

import { ActionTooltip } from '../chrome/action-tooltip'
import { ChromeMenuContent, MENU_ROW } from '../chrome/menu'
import { reportRefusal } from '../left-panel/page-actions'
import { FRAME_TOOL_GROUPS, PRESETS } from './presets'

interface WidthsRowProps {
  /** The one selected frame, at its stored record. */
  frame: FrameRecord
  /** True where the tab may not write or the frame is locked, leaving the list readable. */
  disabled: boolean
  calls: Pick<Structure, 'setWidths'>
}

/** The device groups the plus offers, Phone, Tablet, and Desktop, as the Frame tool lists them. */
const DEVICE_GROUPS = FRAME_TOOL_GROUPS.filter(({ group }) =>
  PRESETS.some(({ preset }) => preset === group),
)

const HUGGING = 'Set the frame’s width first to show it at others'

const CONTROL =
  'outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40'

/**
 * The extra widths one frame also shows at, a chip per width in draw order
 * with a remove button, and a plus opening the Phone, Tablet, and Desktop
 * sizes the frame neither holds nor lists. A pick appends, so the new view
 * draws last. A change shows at once and writes the whole list with the
 * drawn one as `expected`, and a refusal puts the stored list back.
 */
export function WidthsRow({ frame, disabled, calls }: WidthsRowProps) {
  const stored = frame.widths.map((linked) => linked.width)
  const from = `${frame.ref}:${stored.join(',')}`
  // A change stands until the frame reads another list than the one it was
  // made from, and is then forgotten, so an undo back to it reads as stored.
  const [pending, setPending] = useState<{
    from: string
    widths: number[]
  } | null>(null)
  if (pending && pending.from !== from) setPending(null)
  const shown = pending?.from === from ? pending.widths : stored

  const removes = useRef<(HTMLButtonElement | null)[]>([])
  const plus = useRef<HTMLButtonElement | null>(null)
  // The chip index focus lands on once a removed chip leaves the list.
  const focusAt = useRef<number | null>(null)
  useEffect(() => {
    const at = focusAt.current
    if (at === null) return
    focusAt.current = null
    ;(removes.current[Math.min(at, shown.length - 1)] ?? plus.current)?.focus()
  })

  const write = (widths: number[]) => {
    setPending({ from, widths })
    calls
      .setWidths([frame.ref], widths, { [frame.ref]: shown })
      .catch((error: unknown) => {
        setPending(null)
        reportRefusal('Couldn’t set the widths')(error)
      })
  }

  const remove = (index: number) => {
    focusAt.current = index
    write(shown.filter((_, at) => at !== index))
  }

  const groups = DEVICE_GROUPS.map((group) => ({
    ...group,
    rows: group.rows.filter(
      ({ width }) => width !== frame.box.width && !shown.includes(width),
    ),
  })).filter(({ rows }) => rows.length > 0)

  return (
    <div role="group" aria-labelledby="inspector-widths" className="mt-2.5">
      <span
        id="inspector-widths"
        className="mb-1.5 flex h-4 items-center text-caption text-muted-foreground"
      >
        Also shows at
      </span>
      <ul className="flex flex-wrap gap-1.5">
        {shown.map((width, index) => (
          <li
            key={width}
            className="flex h-[26px] items-center gap-0.5 rounded-md bg-input pr-0.5 pl-2 tabular-nums"
          >
            {width}
            <button
              ref={(button) => {
                removes.current[index] = button
              }}
              type="button"
              aria-label={`Remove ${width}`}
              disabled={disabled}
              onClick={() => remove(index)}
              className={cn(
                'grid size-[22px] place-items-center rounded-[5px] text-muted-foreground hover:bg-sidebar hover:text-foreground active:bg-sidebar',
                CONTROL,
              )}
            >
              <X aria-hidden className="size-3" strokeWidth={1.6} />
            </button>
          </li>
        ))}
        <li className="flex">
          {frame.hugWidth ? (
            <ActionTooltip label={HUGGING} side="bottom">
              <button
                ref={plus}
                type="button"
                aria-label="Add a width"
                aria-disabled
                aria-describedby="inspector-widths-hug"
                className={cn(PLUS, CONTROL, 'cursor-default opacity-40')}
              >
                <Plus aria-hidden className="size-[13px]" strokeWidth={1.6} />
              </button>
            </ActionTooltip>
          ) : (
            <DropdownMenu>
              <ActionTooltip label="Add a width" side="bottom">
                <DropdownMenuTrigger
                  ref={plus}
                  aria-label="Add a width"
                  disabled={disabled || groups.length === 0}
                  className={cn(
                    PLUS,
                    CONTROL,
                    'hover:border-muted-foreground hover:text-foreground aria-expanded:bg-accent',
                  )}
                >
                  <Plus aria-hidden className="size-[13px]" strokeWidth={1.6} />
                </DropdownMenuTrigger>
              </ActionTooltip>
              <ChromeMenuContent
                align="start"
                sideOffset={4}
                className="w-auto min-w-[200px]"
              >
                {groups.map(({ group, label, rows }, index) => (
                  <Fragment key={group}>
                    {index > 0 ? <DropdownMenuSeparator /> : null}
                    <DropdownMenuGroup>
                      <DropdownMenuLabel className="px-2 text-label font-normal">
                        {label}
                      </DropdownMenuLabel>
                      {rows.map((row) => (
                        <DropdownMenuItem
                          key={row.name}
                          onClick={() => write([...shown, row.width])}
                          className={cn(MENU_ROW, 'whitespace-nowrap')}
                        >
                          {row.label}
                          <span className="ml-auto pl-4 text-muted-foreground tabular-nums">
                            {row.width}
                          </span>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuGroup>
                  </Fragment>
                ))}
              </ChromeMenuContent>
            </DropdownMenu>
          )}
        </li>
      </ul>
      <p
        id="inspector-widths-hug"
        className="mt-1.5 text-caption text-muted-foreground"
      >
        {frame.hugWidth
          ? 'The frame hugs its width, so set one before adding others.'
          : 'Each is drawn beside the frame from the same file.'}
      </p>
    </div>
  )
}

const PLUS =
  'grid size-[26px] place-items-center rounded-md border border-dashed border-border text-muted-foreground'
