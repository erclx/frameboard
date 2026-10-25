import { type ReactElement, useRef } from 'react'

import { useActions } from '@/client/actions/registry'
import { useKeyboardOpen } from '@/client/components/menu-keyboard'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/client/components/ui/context-menu'

import { DeleteRow, MenuRow, MenuTitle } from './items'

const IDS = [
  'page.rename',
  'page.duplicate',
  'page.new',
  'page.moveUp',
  'page.moveDown',
  'page.delete',
] as const

interface PageMenuProps {
  /** Moves the canvas to the row's page, run as the menu opens. */
  onOpen: () => void
  /** The pages list row the menu opens on, which keeps focus when it closes. */
  trigger: ReactElement
}

/**
 * The Page menu of `canon/design/menus/context` on a pages list row. The
 * `page.*` actions act on the page on the canvas, so opening the menu moves
 * the canvas to the row's page first, and New page below runs `page.new`,
 * which adds the page after the one on the canvas. The menu key and
 * Shift+F10 open it too.
 */
export function PageMenu({ onOpen, trigger }: PageMenuProps) {
  const [rename, duplicate, add, up, down, remove] = useActions(IDS)
  const content = useRef<HTMLDivElement>(null)
  const keyboard = useKeyboardOpen(content)
  return (
    <ContextMenu
      onOpenChange={(opened) => {
        if (opened) onOpen()
      }}
      onOpenChangeComplete={keyboard.onOpenChangeComplete}
    >
      <ContextMenuTrigger render={trigger} onKeyDown={keyboard.onKeyDown} />
      <ContextMenuContent ref={content}>
        <ContextMenuGroup>
          <MenuTitle>Page</MenuTitle>
          <MenuRow action={rename}>Rename</MenuRow>
          <MenuRow action={duplicate}>Duplicate</MenuRow>
          <MenuRow action={add}>New page below</MenuRow>
        </ContextMenuGroup>
        <ContextMenuSeparator />
        <ContextMenuGroup>
          <MenuRow action={up}>Move up</MenuRow>
          <MenuRow action={down}>Move down</MenuRow>
        </ContextMenuGroup>
        <ContextMenuSeparator />
        <DeleteRow action={remove} />
      </ContextMenuContent>
    </ContextMenu>
  )
}
