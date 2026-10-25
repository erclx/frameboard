import { isDeepStrictEqual } from 'node:util'

import type { ServerMessage } from '@/shared/live-messages'

const REPEATABLE = new Set<ServerMessage['type']>([
  'board',
  'reload',
  'thumbnails',
])

/**
 * The pushes with each `board`, `reload`, or `thumbnails` already seen
 * dropped. The watcher can report one write in two batches, and the second
 * repeats those three alone. Any other push, or a repeat carrying different
 * data, stays so a reorder or a changed payload still fails.
 */
export function withoutRepeats(messages: ServerMessage[]): ServerMessage[] {
  const kept: ServerMessage[] = []
  for (const message of messages) {
    const repeat =
      REPEATABLE.has(message.type) &&
      kept.some((earlier) => isDeepStrictEqual(earlier, message))
    if (!repeat) kept.push(message)
  }
  return kept
}
