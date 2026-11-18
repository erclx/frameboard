import { ChevronDown } from 'lucide-react'
import { useState } from 'react'

import {
  DropdownMenu,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/client/components/ui/dropdown-menu'
import { cn } from '@/client/lib/cn'
import type { Structure } from '@/client/live/structure'
import type { FrameRecord, ProjectKitRecord } from '@/shared/records/list'

import { ChromeMenuContent, MENU_ROW } from '../chrome/menu'
import { reportRefusal } from '../left-panel/page-actions'

interface KitRowProps {
  /** The selected frames, one or several, at their stored records. */
  frames: readonly FrameRecord[]
  /** The kits the frames' project added, from the live board. */
  kits: readonly ProjectKitRecord[]
  disabled: boolean
  calls: Pick<Structure, 'setFrameKit'>
}

/** The radio value standing for no kit, which no kit folder can be named, since a dot starts none. */
const NONE = '.none'

/**
 * The kit each selected frame draws with, `None` taking it off. A pick writes
 * every frame in one undo step, and a kit a frame names that the project no
 * longer holds reads as missing until None clears it.
 */
export function KitRow({ frames, kits, disabled, calls }: KitRowProps) {
  const refs = frames.map((frame) => frame.ref)
  const values = frames.map((frame) => frame.kit ?? NONE)
  const stored = values.every((value) => value === values[0])
    ? (values[0] ?? NONE)
    : null
  const from = `${refs.join('\n')}:${stored ?? ''}`
  // Forgotten once the records move, so an undo back to the start reads as stored.
  const [pending, setPending] = useState<{
    from: string
    value: string
  } | null>(null)
  if (pending && pending.from !== from) setPending(null)
  const shown = pending?.from === from ? pending.value : stored

  const pick = (value: string) => {
    if (value === shown) return
    setPending({ from, value })
    calls
      .setFrameKit(refs, value === NONE ? null : value)
      .catch((error: unknown) => {
        setPending(null)
        reportRefusal('Couldn’t set the kit')(error)
      })
  }

  const missing =
    shown !== null && shown !== NONE && !kits.some(({ name }) => name === shown)
      ? shown
      : null
  const label =
    shown === null
      ? 'Mixed'
      : shown === NONE
        ? 'None'
        : (kits.find(({ name }) => name === shown)?.title ?? shown)

  return (
    <div className="mt-2.5">
      <div className="flex h-[26px] items-center gap-2">
        <span id="inspector-kit" className="w-12 shrink-0 text-xs">
          Kit
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={disabled}
            aria-labelledby="inspector-kit inspector-kit-value"
            className="flex h-[26px] min-w-0 flex-1 items-center justify-between gap-1 rounded-md bg-input px-2 text-left text-xs outline-none hover:ring-1 hover:ring-border focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40 aria-expanded:ring-1 aria-expanded:ring-border"
          >
            <span
              id="inspector-kit-value"
              className={cn(
                'truncate',
                shown === null && 'text-muted-foreground',
              )}
            >
              {label}
              {missing ? ' (missing)' : null}
            </span>
            <ChevronDown
              aria-hidden
              className="size-2.5 shrink-0 text-muted-foreground"
            />
          </DropdownMenuTrigger>
          <ChromeMenuContent
            align="end"
            sideOffset={4}
            className="w-auto min-w-[180px]"
          >
            <DropdownMenuRadioGroup
              value={shown}
              onValueChange={(value: string) => pick(value)}
            >
              <DropdownMenuRadioItem
                value={NONE}
                closeOnClick
                className={cn(MENU_ROW, 'pr-8')}
              >
                None
              </DropdownMenuRadioItem>
              {kits.length > 0 ? <DropdownMenuSeparator /> : null}
              {kits.map((kit) => (
                <DropdownMenuRadioItem
                  key={kit.name}
                  value={kit.name}
                  closeOnClick
                  className={cn(MENU_ROW, 'pr-8 whitespace-nowrap')}
                >
                  {kit.title}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </ChromeMenuContent>
        </DropdownMenu>
      </div>
      <p className="mt-1.5 text-caption leading-[1.45] text-muted-foreground">
        {missing
          ? `This project holds no kit ${missing}. None takes it off.`
          : kits.length === 0
            ? 'Add a kit in the Theme tab to set one here.'
            : 'None takes the kit off.'}
      </p>
    </div>
  )
}
