import type { LucideIcon } from 'lucide-react'

import { liveKey, useCharacterKeysOn } from '@/client/actions/character-keys'
import { keyLabel } from '@/client/actions/keys'
import { type Action, isEnabled } from '@/client/actions/registry'
import { DropdownMenuRadioItem } from '@/client/components/ui/dropdown-menu'
import { cn } from '@/client/lib/cn'

import { MENU_ROW, MenuKey } from './menu'

/** A row choosing one of a set, which marks the chosen one the way every tool menu does. */
const CHOICE_ROW = cn(
  MENU_ROW,
  'gap-2 pr-2 data-checked:bg-primary-fill data-checked:text-primary-foreground [&_[data-slot=dropdown-menu-radio-item-indicator]]:hidden',
)

interface ToolRowProps {
  value: string
  row: { label: string; key: string; icon: LucideIcon }
  /** Undefined until a row registers it, which shows the item disabled. */
  action: Action | undefined
}

/** A tool's menu row, with its icon and its first live key on the right. */
export function ToolRow({ value, row, action }: ToolRowProps) {
  const key = liveKey(action?.keys ?? [row.key], useCharacterKeysOn())
  const Icon = row.icon
  return (
    <DropdownMenuRadioItem
      value={value}
      // A radio row stays open by default, which spends the next canvas click on closing it.
      closeOnClick
      disabled={!action || !isEnabled(action)}
      className={CHOICE_ROW}
    >
      <Icon aria-hidden className="size-[13px]" />
      {row.label}
      {key ? <MenuKey>{keyLabel(key)}</MenuKey> : null}
    </DropdownMenuRadioItem>
  )
}
