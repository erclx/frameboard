import { cn } from 'cn'
import {
  Frame,
  Hand,
  type LucideIcon,
  Maximize,
  MessageSquare,
  Moon,
  MousePointer2,
  Pencil,
  Play,
  Redo2,
  Sun,
  Undo2,
} from 'lucide-react'
import { Fragment } from 'react'

import { type Action, isEnabled, useActions } from '@/client/actions/registry'

import { ActionTooltip } from './action-tooltip'

/**
 * A toolbar place and what it shows before its action registers. A row
 * registering the action supplies its own label and keys, which win.
 */
interface Slot {
  id: string
  label: string
  keys?: readonly string[]
  icon: LucideIcon
  /** Drawn in dark in place of `icon`, as the theme toggle shows the moon. */
  darkIcon?: LucideIcon
}

/** The groups in the order `canon/design/toolbar/floating` draws them, divided by a rule. */
const GROUPS: readonly (readonly Slot[])[] = [
  [
    { id: 'tool.move', label: 'Move', keys: ['v'], icon: MousePointer2 },
    { id: 'tool.hand', label: 'Hand', keys: ['h'], icon: Hand },
    { id: 'tool.frame', label: 'Frame', keys: ['f'], icon: Frame },
    { id: 'tool.note', label: 'Note', keys: ['n'], icon: MessageSquare },
  ],
  [
    { id: 'edit.undo', label: 'Undo', icon: Undo2 },
    { id: 'edit.redo', label: 'Redo', icon: Redo2 },
  ],
  [
    {
      id: 'view.zoomToFit',
      label: 'Zoom to fit',
      keys: ['Shift+Digit1'],
      icon: Maximize,
    },
    { id: 'theme.toggle', label: 'Theme', icon: Sun, darkIcon: Moon },
  ],
]

const MODES: readonly Slot[] = [
  { id: 'mode.edit', label: 'Edit', icon: Pencil },
  { id: 'mode.play', label: 'Play', icon: Play },
]

const SLOTS = [...GROUPS.flat(), ...MODES]
const IDS = SLOTS.map((slot) => slot.id)

/**
 * The floating pill centered at the foot of the canvas column. Every button
 * runs its action from the registry, and one whose action no row has
 * registered yet shows disabled with its name and key on hover.
 */
export function Toolbar() {
  const actions = new Map(
    useActions(IDS).map((action, index) => [IDS[index], action]),
  )
  return (
    <div
      role="toolbar"
      aria-label="Tools"
      className="absolute bottom-4 left-1/2 z-10 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-0.5 overflow-x-auto rounded-xl border border-border bg-card p-[5px] shadow-[0_6px_24px_rgba(0,0,0,.18),0_1px_3px_rgba(0,0,0,.12)]"
    >
      {GROUPS.map((group, index) => (
        <Fragment key={group[0]?.id}>
          {index > 0 ? <Rule /> : null}
          {group.map((slot) => (
            <ToolButton
              key={slot.id}
              slot={slot}
              action={actions.get(slot.id)}
            />
          ))}
        </Fragment>
      ))}
      <Rule />
      <div className="flex shrink-0 rounded-lg bg-muted p-0.5">
        {MODES.map((slot) => (
          <ModeButton key={slot.id} slot={slot} action={actions.get(slot.id)} />
        ))}
      </div>
    </div>
  )
}

interface ButtonProps {
  slot: Slot
  action: Action | undefined
}

function ToolButton({ slot, action }: ButtonProps) {
  const { label, keys, on, enabled, run } = read(slot, action)
  const Icon = slot.icon
  const DarkIcon = slot.darkIcon
  return (
    <ActionTooltip label={label} keys={keys}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={action?.checked ? on : undefined}
        aria-disabled={enabled ? undefined : true}
        onClick={run}
        className={cn(
          'grid size-8 shrink-0 place-items-center rounded-[7px] text-foreground outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-transparent',
          on &&
            'bg-primary text-primary-foreground hover:bg-primary aria-disabled:hover:bg-primary',
        )}
      >
        <Icon aria-hidden className={cn('size-4', DarkIcon && 'dark:hidden')} />
        {DarkIcon ? (
          <DarkIcon aria-hidden className="hidden size-4 dark:block" />
        ) : null}
      </button>
    </ActionTooltip>
  )
}

/** One half of the Edit and Play segment, where Play shows on in the selection blue. */
function ModeButton({ slot, action }: ButtonProps) {
  const { label, keys, on, enabled, run } = read(slot, action)
  const Icon = slot.icon
  return (
    <ActionTooltip label={label} keys={keys}>
      <button
        type="button"
        aria-pressed={on}
        aria-disabled={enabled ? undefined : true}
        onClick={run}
        className={cn(
          'flex h-[26px] items-center gap-[5px] rounded-md px-[9px] font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50',
          on && slot.id === 'mode.play'
            ? 'bg-primary text-primary-foreground hover:text-primary-foreground'
            : on && 'bg-card text-foreground ring-1 ring-border',
        )}
      >
        <Icon aria-hidden className="size-3.5" />
        {label}
      </button>
    </ActionTooltip>
  )
}

function Rule() {
  return <span aria-hidden className="mx-[5px] h-5 w-px shrink-0 bg-border" />
}

function read(slot: Slot, action: Action | undefined) {
  const enabled = action ? isEnabled(action) : false
  return {
    label: action?.label ?? slot.label,
    keys: action?.keys ?? slot.keys,
    on: action?.checked?.() ?? false,
    enabled,
    run: () => {
      if (action && enabled) action.run()
    },
  }
}
