import { type KeyboardEvent, type RefObject, useRef } from 'react'

/**
 * The trigger handlers that open a row's menu from the keyboard, on the menu
 * key or Shift+F10, with focus moving to the menu's first enabled item.
 * Chromium on macOS fires no `contextmenu` for Shift+F10, so the key sends
 * one inside the row, where a right click would land. `content` is the
 * menu's popup and `onOpenChangeComplete` goes on the menu's root.
 */
export function useKeyboardOpen(content: RefObject<HTMLDivElement | null>) {
  const openedByKey = useRef(false)
  return {
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      const menuKey =
        event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)
      if (!menuKey) return
      event.preventDefault()
      event.stopPropagation()
      openedByKey.current = true
      const box = event.currentTarget.getBoundingClientRect()
      event.currentTarget.dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: box.left + box.width / 2,
          clientY: box.top + box.height / 2,
        }),
      )
    },
    onOpenChangeComplete: (opened: boolean) => {
      if (!opened || !openedByKey.current) return
      openedByKey.current = false
      content.current
        ?.querySelector<HTMLElement>(
          '[role="menuitem"]:not([aria-disabled="true"])',
        )
        ?.focus()
    },
  }
}
