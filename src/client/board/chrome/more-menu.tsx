import { Ellipsis, type LucideIcon } from 'lucide-react'
import { Fragment } from 'react'
import { useStore } from 'zustand'

import { liveKey, useCharacterKeysOn } from '@/client/actions/character-keys'
import { keyLabel } from '@/client/actions/keys'
import { type Action, isEnabled } from '@/client/actions/registry'
import {
  DropdownMenu,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/client/components/ui/dropdown-menu'
import { cn } from '@/client/lib/cn'

import { placementStore, type Placing, SHAPES } from '../place/tool'
import { useBoxTool } from '../sections/actions'
import { ActionTooltip } from './action-tooltip'
import { ActionMenuItem, ChromeMenuContent, MENU_ROW, MenuKey } from './menu'
import type { ToolbarStage } from './toolbar-stage'
import {
  BOX_TOOLS,
  EDIT_AND_VIEW,
  HAND_TOOL,
  IMAGE_ROW,
  MODE_TOGGLE,
  MODES,
  NOTE_TOOL,
  PLACINGS,
  POINTER_TOOLS,
  type Slot,
  TEXT_TOOL,
} from './toolbar-tools'

type Actions = ReadonlyMap<string, Action | undefined>

interface ChoiceRowProps {
  value: string
  label: string
  icon?: LucideIcon
  keys?: readonly string[]
  disabled?: boolean
}

/** A row choosing one of a set, which marks the chosen one with the selection fill. */
function ChoiceRow({
  value,
  label,
  icon: Icon,
  keys,
  disabled,
}: ChoiceRowProps) {
  const key = liveKey(keys, useCharacterKeysOn())
  return (
    <DropdownMenuRadioItem
      value={value}
      // A radio row stays open by default, which spends the next canvas click on closing it.
      closeOnClick
      disabled={disabled}
      className={cn(
        MENU_ROW,
        'gap-2 pr-2 data-checked:bg-primary-fill data-checked:text-primary-foreground [&_[data-slot=dropdown-menu-radio-item-indicator]]:hidden',
      )}
    >
      {Icon ? <Icon aria-hidden className="size-[13px]" /> : null}
      {label}
      {key ? <MenuKey>{keyLabel(key)}</MenuKey> : null}
    </DropdownMenuRadioItem>
  )
}

interface ToolRowProps {
  value: string
  row: { label: string; key: string; icon: LucideIcon }
  /** Undefined until a row registers it, which shows the item disabled. */
  action: Action | undefined
}

/** A tool's menu row, with its icon and its first live key on the right. */
export function ToolRow({ value, row, action }: ToolRowProps) {
  return (
    <ChoiceRow
      value={value}
      label={row.label}
      icon={row.icon}
      keys={action?.keys ?? [row.key]}
      disabled={!action || !isEnabled(action)}
    />
  )
}

/** Opens the picker rather than choosing a tool, so a slot keeps its last shape. */
export function ImageRow({ action }: { action: Action | undefined }) {
  const Icon = IMAGE_ROW.icon
  return (
    <ActionMenuItem
      action={action}
      label={IMAGE_ROW.label}
      keys={[IMAGE_ROW.key]}
    >
      <span className="flex items-center gap-2 whitespace-nowrap">
        <Icon aria-hidden className="size-[13px]" />
        {IMAGE_ROW.label}…
      </span>
    </ActionMenuItem>
  )
}

/** The Place choices under their heading, which write nothing and so stay on in any tab. */
export function PlaceRows() {
  const placing = useStore(placementStore, (state) => state.placing)
  return (
    <DropdownMenuGroup>
      <DropdownMenuLabel>Place new elements</DropdownMenuLabel>
      <DropdownMenuRadioGroup
        value={placing}
        onValueChange={(value: Placing) =>
          placementStore.setState({ placing: value })
        }
      >
        {PLACINGS.map(({ value, label }) => (
          <ChoiceRow key={value} value={value} label={label} />
        ))}
      </DropdownMenuRadioGroup>
    </DropdownMenuGroup>
  )
}

function ModeRows({ actions }: { actions: Actions }) {
  const on = MODES.find((slot) => actions.get(slot.id)?.checked?.())?.id ?? ''
  const toggleKeys = actions.get(MODE_TOGGLE)?.keys
  return (
    <DropdownMenuRadioGroup
      value={on}
      onValueChange={(id: string) => runIfEnabled(actions.get(id))}
    >
      {MODES.map((slot) => {
        const action = actions.get(slot.id)
        return (
          <ChoiceRow
            key={slot.id}
            value={slot.id}
            label={action?.label ?? slot.label}
            icon={slot.icon}
            // The one key flips the mode, so it names the row it would switch to.
            keys={slot.id === on ? undefined : toggleKeys}
            disabled={!action || !isEnabled(action)}
          />
        )
      })}
    </DropdownMenuRadioGroup>
  )
}

/**
 * The tools the bar no longer draws. With the five slots in view it offers each
 * slot's other tool, since a slot shows only one of its pair and a click on it
 * can never reach the second.
 */
function ToolRows({
  actions,
  slotsInView,
}: {
  actions: Actions
  slotsInView: boolean
}) {
  const boxTool = useBoxTool()
  const handOn = actions.get(HAND_TOOL)?.checked?.() ?? false
  const leading = slotsInView
    ? [
        POINTER_TOOLS[handOn ? 0 : 1],
        BOX_TOOLS.find((row) => row.tool !== boxTool) ?? BOX_TOOLS[1],
      ]
    : [...POINTER_TOOLS, ...BOX_TOOLS, TEXT_TOOL]
  const on =
    [...leading, ...SHAPES, NOTE_TOOL].find((row) =>
      actions.get(row.id)?.checked?.(),
    )?.id ?? ''
  return (
    <DropdownMenuRadioGroup
      value={on}
      onValueChange={(id: string) => runIfEnabled(actions.get(id))}
    >
      {[...leading, ...SHAPES].map((row) => (
        <ToolRow
          key={row.id}
          value={row.id}
          row={row}
          action={actions.get(row.id)}
        />
      ))}
      <ImageRow action={actions.get(IMAGE_ROW.id)} />
      {slotsInView ? null : (
        <ToolRow
          value={NOTE_TOOL.id}
          row={NOTE_TOOL}
          action={actions.get(NOTE_TOOL.id)}
        />
      )}
    </DropdownMenuRadioGroup>
  )
}

function SlotRow({ slot, action }: { slot: Slot; action: Action | undefined }) {
  const Icon = slot.icon
  const DarkIcon = slot.darkIcon
  return (
    <ActionMenuItem action={action} label={slot.label} keys={slot.keys}>
      <span className="flex items-center gap-2 whitespace-nowrap">
        <Icon
          aria-hidden
          className={cn('size-[13px]', DarkIcon && 'dark:hidden')}
        />
        {DarkIcon ? (
          <DarkIcon aria-hidden className="hidden size-[13px] dark:block" />
        ) : null}
        {action?.label ?? slot.label}
      </span>
    </ActionMenuItem>
  )
}

/**
 * Every control the stage folded away, each row running the action the bar's
 * button runs. Keyed by the stage where it is drawn, so an open menu closes
 * rather than keeping a stale list when the column crosses a stage's edge.
 */
export function MoreMenu({
  stage,
  actions,
}: {
  stage: Exclude<ToolbarStage, 'full'>
  actions: Actions
}) {
  return (
    <DropdownMenu>
      <ActionTooltip label="More tools">
        <DropdownMenuTrigger
          aria-label="More tools"
          className="grid size-8 shrink-0 place-items-center rounded-[7px] text-foreground outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:bg-accent"
        >
          <Ellipsis aria-hidden className="size-4" />
        </DropdownMenuTrigger>
      </ActionTooltip>
      <ChromeMenuContent
        side="top"
        align="start"
        sideOffset={8}
        className="w-[220px]"
      >
        {stage === 'more' ? (
          <>
            <ModeRows actions={actions} />
            <DropdownMenuSeparator />
          </>
        ) : null}
        {stage === 'folded' ? null : (
          <>
            <ToolRows actions={actions} slotsInView={stage === 'tools'} />
            <DropdownMenuSeparator />
            <PlaceRows />
            <DropdownMenuSeparator />
          </>
        )}
        {EDIT_AND_VIEW.map((group, index) => (
          <Fragment key={group[0]?.id}>
            {index > 0 ? <DropdownMenuSeparator /> : null}
            {group.map((slot) => (
              <SlotRow
                key={slot.id}
                slot={slot}
                action={actions.get(slot.id)}
              />
            ))}
          </Fragment>
        ))}
      </ChromeMenuContent>
    </DropdownMenu>
  )
}

function runIfEnabled(action: Action | undefined): void {
  if (action && isEnabled(action)) action.run()
}
