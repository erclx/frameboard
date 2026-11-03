import type { KeyboardEvent } from 'react'

import { characterKeysOn } from '@/client/actions/character-keys'
import { findAction, isEnabled } from '@/client/actions/registry'
import { focusFolder } from '@/client/projects/actions'

import type { HomeLayout } from './layout'

/** Runs the folder action a key names on a focused folder card or row, F2 renaming it. */
export function runFolderKey(event: KeyboardEvent, key: string): void {
  if (event.key !== 'F2') return
  focusFolder(key)
  const action = findAction('folder.rename')
  if (action && isEnabled(action)) action.run()
  event.preventDefault()
}

/**
 * Moves focus across the cards by the arrow keys, or h, j, k, and l while
 * single-key shortcuts are on, Up and Down stepping to the nearest card in
 * the grid's next row as it is laid out, and down the list, with Home and End for the ends. Keys
 * typed into a rename field stay in the field.
 */
export function roveFocus(
  event: KeyboardEvent<HTMLElement>,
  layout: HomeLayout,
) {
  const from = event.target
  if (!(from instanceof HTMLElement) || !from.matches(LINK)) return
  const links = [...event.currentTarget.querySelectorAll<HTMLElement>(LINK)]
  const at = links.indexOf(from)
  const grid = layout === 'grid'
  const key = pressedKey(event)
  const to = {
    ArrowLeft: grid ? at - 1 : at,
    ArrowRight: grid ? at + 1 : at,
    ArrowUp: grid ? rowStep(links, at, -1) : at - 1,
    ArrowDown: grid ? rowStep(links, at, 1) : at + 1,
    Home: 0,
    End: links.length - 1,
  }[key]
  if (to === undefined) return
  event.preventDefault()
  links[Math.min(Math.max(to, 0), links.length - 1)]?.focus()
}

/**
 * The arrow a bare h, j, k, or l stands for, or the key itself. These read
 * the Single-key shortcuts switch here, since the cards' own keys never pass
 * through the registry's `press`.
 */
function pressedKey(event: KeyboardEvent<HTMLElement>): string {
  const modified = event.ctrlKey || event.metaKey || event.altKey
  const arrow = VIM_KEYS[event.key]
  return arrow && !modified && characterKeysOn() ? arrow : event.key
}

const VIM_KEYS: Readonly<Record<string, string>> = {
  h: 'ArrowLeft',
  j: 'ArrowDown',
  k: 'ArrowUp',
  l: 'ArrowRight',
}

/**
 * The card in the next row up or down nearest the one at `at`, read off
 * where the grid laid them out rather than counted, since the pinned row
 * may end short of a full row. Stays put at the first or last row.
 */
function rowStep(
  links: readonly HTMLElement[],
  at: number,
  direction: 1 | -1,
): number {
  const boxes = links.map((link) => link.getBoundingClientRect())
  const from = boxes[at]
  if (!from) return at
  const tops = boxes
    .map((box) => box.top)
    .filter((top) => (top - from.top) * direction > 0)
  if (tops.length === 0) return at
  const row = direction > 0 ? Math.min(...tops) : Math.max(...tops)
  let nearest = at
  boxes.forEach((box, index) => {
    if (box.top !== row) return
    const near = boxes[nearest]
    if (
      nearest === at ||
      (near && Math.abs(box.left - from.left) < Math.abs(near.left - from.left))
    )
      nearest = index
  })
  return nearest
}

/** What every card and row the arrow keys move across carries, a folder's as well as a project's. */
export const LINK = '[data-project-link]'
