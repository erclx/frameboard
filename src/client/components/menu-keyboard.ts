import { type KeyboardEvent, type RefObject, useRef } from 'react'

/**
 * Opens a row's menu from the keyboard, sending its own `contextmenu`, since
 * Chromium on macOS fires none for Shift+F10.
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
