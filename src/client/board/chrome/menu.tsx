import { cn } from 'cn'
import type { ComponentProps, ReactNode } from 'react'

import { keyLabel } from '@/client/actions/keys'
import { type Action, isEnabled } from '@/client/actions/registry'
import {
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/client/components/ui/dropdown-menu'

/** The kit's menu at the chrome's size, as `canon/design/menus/avatar` draws it. */
export function ChromeMenuContent({
  className,
  ...props
}: ComponentProps<typeof DropdownMenuContent>) {
  return (
    <DropdownMenuContent
      className={cn(
        'w-60 rounded-[10px] p-1 text-xs shadow-[0_12px_40px_rgba(0,0,0,.3)] ring-border',
        className,
      )}
      {...props}
    />
  )
}

interface ActionMenuItemProps {
  /** Undefined until a row registers it, which shows the item disabled. */
  action: Action | undefined
  /** The name shown before the action registers. */
  label: string
  /** The key shown before the action registers. */
  keys?: readonly string[]
  children?: ReactNode
}

/** A menu row running an action, with its first key on the right. */
export function ActionMenuItem({
  action,
  label,
  keys,
  children,
}: ActionMenuItemProps) {
  const key = (action?.keys ?? keys)?.[0]
  return (
    <DropdownMenuItem
      disabled={!action || !isEnabled(action)}
      onClick={() => action?.run()}
      className={MENU_ROW}
    >
      {children ?? action?.label ?? label}
      {key ? <MenuKey>{keyLabel(key)}</MenuKey> : null}
    </DropdownMenuItem>
  )
}

/**
 * A menu row's height and padding, shared by the rows that are not actions.
 * Kit parts take Tailwind's `text-xs` for the board's 12px, since `cn` reads
 * `text-body` as a color and keeps the kit's `text-sm` beside it.
 */
export const MENU_ROW = 'h-7 rounded-md px-2 py-0 text-xs'

export function MenuKey({ children }: { children: ReactNode }) {
  return (
    <kbd className="ml-auto grid h-5 min-w-5 place-items-center rounded-[5px] bg-muted px-[5px] font-sans text-label font-normal text-muted-foreground">
      {children}
    </kbd>
  )
}
