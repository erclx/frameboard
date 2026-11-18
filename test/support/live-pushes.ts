import { isDeepStrictEqual } from 'node:util'

import type { ServerMessage } from '@/shared/live-messages'

const REPEATABLE = new Set<ServerMessage['type']>([
  'board',
  'reload',
  'thumbnails',
  'findings',
])

/**
 * The pushes without a split batch's identical repeats, so a reorder or a
 * changed payload still fails.
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
