import type { ReactNode } from 'react'

import { keyParts } from '@/client/actions/keys'
import { type Action, isEnabled } from '@/client/actions/registry'
import {
  ContextMenuItem,
  ContextMenuLabel,
} from '@/client/components/ui/context-menu'

interface MenuRowProps {
  /** Undefined until its row registers it, which shows the item disabled. */
  action: Action | undefined
  /** The row's text, the action's label when absent. */
  children?: ReactNode
  /**
   * The binding whose chips the row shows, the action's first key when
   * absent. A menu-only action shows the key of the action it stands in for,
   * as Paste here shows Paste's.
   */
  binding?: string
  /** Chips drawn as given, for a key no binding names the way the menu draws it, as Delete's ⌫. */
  chips?: readonly string[]
  /** The key a screen reader announces for `chips`. */
  keyName?: string
  variant?: 'default' | 'destructive'
}

/**
 * One context menu row running an action, greyed while the action is
 * disabled, with its key drawn as one chip per part, as
 * `canon/design/menus/context` draws them.
 */
export function MenuRow({
  action,
  children,
  binding,
  chips,
  keyName,
  variant,
}: MenuRowProps) {
  const key = binding ?? action?.keys?.[0]
  const parts = chips ?? (key ? keyParts(key) : [])
  return (
    <ContextMenuItem
      variant={variant}
      disabled={!action || !isEnabled(action)}
      aria-keyshortcuts={keyName}
      onClick={() => action?.run()}
    >
      {children ?? action?.label}
      {parts.length > 0 ? (
        <span aria-hidden className="ml-auto flex gap-[3px]">
          {parts.map((part, index) => (
            <kbd
              // A binding can repeat a part no more than its own order allows.
              // oxlint-disable-next-line react/no-array-index-key
              key={index}
              className="grid h-5 min-w-5 place-items-center rounded-[5px] bg-muted px-[5px] font-sans text-[11px] font-normal text-muted-foreground"
            >
              {part}
            </kbd>
          ))}
        </span>
      ) : null}
    </ContextMenuItem>
  )
}

/** The destructive Delete row closing a menu, its key drawn as the ⌫ chip. */
export function DeleteRow({ action }: { action: Action | undefined }) {
  return (
    <MenuRow
      action={action}
      chips={['⌫']}
      keyName="Delete"
      variant="destructive"
    >
      Delete
    </MenuRow>
  )
}

/** The faint label naming what a menu opened on, as Page or Empty canvas. */
export function MenuTitle({ children }: { children: string }) {
  return <ContextMenuLabel>{children}</ContextMenuLabel>
}
