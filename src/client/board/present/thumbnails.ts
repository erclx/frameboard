import { useEffect } from 'react'

import { liveStore, receiveThumbnails, useLive } from '@/client/live/store'
import { useShownTheme } from '@/client/theme/store'
import type { FrameRecord } from '@/shared/records/list'
import type { Theme } from '@/shared/theme'

/**
 * Each slide's thumbnail stamp in the board's theme, asked again when a slide
 * changes. A slide still rendering reads undefined until the socket lands it.
 */
export function usePageThumbnails(
  page: string,
  slides: readonly FrameRecord[],
  send: typeof fetch = fetch,
): { theme: Theme; stamps: Readonly<Record<string, string>> } {
  const theme = useShownTheme()
  const stamps = useLive((state) => state.thumbnails[theme])
  const versions = useLive((state) =>
    slides.map((slide) => state.reloads[slide.ref] ?? 0).join(','),
  )
  useEffect(() => {
    void askStamps(send, page, theme)
  }, [send, page, theme, versions])
  return { theme, stamps }
}

export function thumbnailUrl(ref: string, theme: Theme, stamp: string): string {
  return `/api/thumbnails/png?${new URLSearchParams({ ref, theme, v: stamp })}`
}

async function askStamps(
  send: typeof fetch,
  page: string,
  theme: Theme,
): Promise<void> {
  try {
    const response = await send(
      `/api/thumbnails?${new URLSearchParams({ theme, page })}`,
    )
    const body = (await response.json()) as {
      ok: boolean
      data?: { stamps: Record<string, string> }
    }
    if (body.ok && body.data) {
      receiveThumbnails(liveStore, theme, body.data.stamps)
    }
  } catch {
    // A failed ask leaves each cell on its name, and the next change asks again.
  }
}
