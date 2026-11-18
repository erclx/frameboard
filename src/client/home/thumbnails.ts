import { useEffect, useRef } from 'react'

import { liveStore, receiveThumbnails, useLive } from '@/client/live/store'
import { useShownTheme } from '@/client/theme/store'
import { cardFrames } from '@/shared/card-frames'
import type { Theme } from '@/shared/theme'

/**
 * How long the hook waits after a change before asking, so a batch's board,
 * reloads, and stale stamps, which arrive as separate messages, ask once.
 */
const ASK_DELAY_MS = 100

/**
 * Asks for the shown theme's thumbnails while home is open, each landing over
 * the socket, so a frame still rendering is never asked about again until it
 * changes.
 */
export function useThumbnails(send: typeof fetch = fetch): void {
  const theme = useShownTheme()
  const connected = useLive((state) => state.connected)
  const board = useLive((state) => state.board)
  const reloads = useLive((state) => state.reloads)
  // What each frame was last asked about as, in the theme and connection held.
  const asked = useRef(new Map<string, string>())

  useEffect(() => {
    asked.current = new Map()
  }, [theme, connected])

  useEffect(() => {
    if (!connected || !board) return
    const wanted = new Map(
      board.projects
        .flatMap((project) => cardFrames(project))
        .map(({ ref, box }) => [
          ref,
          `${box.width}x${box.height}#${reloads[ref] ?? 0}`,
        ]),
    )
    const due = [...wanted].some(([ref, key]) => asked.current.get(ref) !== key)
    if (!due) return
    const timer = setTimeout(() => {
      for (const [ref, key] of wanted) asked.current.set(ref, key)
      void askStamps(send, theme)
    }, ASK_DELAY_MS)
    return () => clearTimeout(timer)
  }, [send, theme, connected, board, reloads])
}

async function askStamps(send: typeof fetch, theme: Theme): Promise<void> {
  try {
    const response = await send(`/api/thumbnails?theme=${theme}`)
    const body = (await response.json()) as {
      ok: boolean
      data?: { stamps: Record<string, string> }
    }
    if (body.ok && body.data)
      receiveThumbnails(liveStore, theme, body.data.stamps)
  } catch {
    // A failed ask leaves the skeleton, and the next change asks again.
  }
}
