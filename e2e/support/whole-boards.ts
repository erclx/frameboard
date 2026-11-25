import type { ClientMessage } from '@/shared/live-messages'

/**
 * A message from the tab with `patches` dropped from its hello, so a routed
 * socket that rewrites `board` messages keeps getting them, since a patch
 * would undo the rewrite.
 */
export function wholeBoards(message: string | Buffer): string {
  const parsed = JSON.parse(String(message)) as ClientMessage
  if (parsed.type !== 'hello' || parsed.role !== 'board') return String(message)
  return JSON.stringify({ ...parsed, patches: undefined })
}
