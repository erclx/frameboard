import { cn } from 'cn'
import {
  ChevronDown,
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
  Type,
  Undo2,
} from 'lucide-react'
import { Fragment } from 'react'

import { liveKey, useCharacterKeysOn } from '@/client/actions/character-keys'
import { keyLabel } from '@/client/actions/keys'
import { type Action, isEnabled, useActions } from '@/client/actions/registry'
import {
  DropdownMenu,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/client/components/ui/dropdown-menu'

import { shapeRow, SHAPES, useShape } from '../place/tool'
import { ActionTooltip } from './action-tooltip'
import { ChromeMenuContent, MENU_ROW, MenuKey } from './menu'

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

const SHAPE_SLOT = 'tool.shape'

/** The groups in the order `canon/design/toolbar/floating` draws them, divided by a rule. */
const GROUPS: readonly (readonly Slot[])[] = [
  [
    { id: 'tool.move', label: 'Move', keys: ['v'], icon: MousePointer2 },
    { id: 'tool.hand', label: 'Hand', keys: ['h'], icon: Hand },
    { id: 'tool.frame', label: 'Frame', keys: ['f'], icon: Frame },
    { id: 'tool.text', label: 'Text', keys: ['t'], icon: Type },
    // Stands in for the Shape slot, which `ShapeTool` draws from the last shape chosen.
    { id: SHAPE_SLOT, label: 'Shape', icon: SHAPES[0].icon },
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
const IDS = [
  ...SLOTS.map((slot) => slot.id).filter((id) => id !== SHAPE_SLOT),
  ...SHAPES.map((row) => row.id),
]

/**
 * The floating pill centered at the foot of the canvas column. Every button
 * runs its action from the registry, and one whose action no row has
 * registered yet shows disabled with its name and key on hover.
 */
export function Toolbar() {
  const registered = useActions(IDS)
  const actions = new Map(IDS.map((id, index) => [id, registered[index]]))
  return (
    <div
      role="toolbar"
      aria-label="Tools"
      className="absolute bottom-4 left-1/2 z-10 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-0.5 overflow-x-auto rounded-xl border border-border bg-card p-[5px] shadow-[0_6px_24px_rgba(0,0,0,.18),0_1px_3px_rgba(0,0,0,.12)]"
    >
      {GROUPS.map((group, index) => (
        <Fragment key={group[0]?.id}>
          {index > 0 ? <Rule /> : null}
          {group.map((slot) =>
            slot.id === SHAPE_SLOT ? (
              <ShapeTool key={slot.id} actions={actions} />
            ) : (
              <ToolButton
                key={slot.id}
                slot={slot}
                action={actions.get(slot.id)}
              />
            ),
          )}
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
  /** Shows the button pressed whatever its action reads, as the Shape tool does for any shape. */
  pressed?: boolean
}

function ToolButton({ slot, action, pressed }: ButtonProps) {
  const shown = read(slot, action)
  const { label, keys, enabled, run } = shown
  const on = pressed ?? shown.on
  const Icon = slot.icon
  const DarkIcon = slot.darkIcon
  return (
    <ActionTooltip label={label} keys={keys}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={action?.checked || pressed !== undefined ? on : undefined}
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

/**
 * The Shape tool: a button placing the last shape chosen, pressed while any
 * shape is on, and a caret opening the menu of shapes, the one chosen
 * marked, each naming its key.
 */
function ShapeTool({
  actions,
}: {
  actions: ReadonlyMap<string, Action | undefined>
}) {
  const shown = useShape()
  const keysOn = useCharacterKeysOn()
  const action = actions.get(shown.id)
  const slot = {
    id: shown.id,
    label: shown.label,
    keys: [shown.key],
    icon: shown.icon,
  }
  const on = SHAPES.some((row) => actions.get(row.id)?.checked?.() ?? false)
  return (
    <>
      <ToolButton slot={slot} action={action} pressed={on} />
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Shapes"
          className="-ml-0.5 grid h-8 w-3 shrink-0 place-items-center rounded-[5px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:text-foreground"
        >
          <ChevronDown aria-hidden className="size-[9px]" />
        </DropdownMenuTrigger>
        <ChromeMenuContent
          side="top"
          align="start"
          sideOffset={8}
          className="w-[190px]"
        >
          <DropdownMenuRadioGroup
            value={shown.kind}
            onValueChange={(kind) => {
              const row = actions.get(shapeRow(kind).id)
              if (row && isEnabled(row)) row.run()
            }}
          >
            {SHAPES.map((row) => {
              const registered = actions.get(row.id)
              const key = liveKey(registered?.keys ?? [row.key], keysOn)
              const Icon = row.icon
              return (
                <DropdownMenuRadioItem
                  key={row.id}
                  value={row.kind}
                  disabled={!registered || !isEnabled(registered)}
                  className={cn(
                    MENU_ROW,
                    'gap-2 pr-2 data-checked:bg-primary data-checked:text-primary-foreground [&_[data-slot=dropdown-menu-radio-item-indicator]]:hidden',
                  )}
                >
                  <Icon aria-hidden className="size-[13px]" />
                  {row.label}
                  {key ? <MenuKey>{keyLabel(key)}</MenuKey> : null}
                </DropdownMenuRadioItem>
              )
            })}
          </DropdownMenuRadioGroup>
        </ChromeMenuContent>
      </DropdownMenu>
    </>
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
