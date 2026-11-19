import { type RefObject, useEffect, useState } from 'react'

import { cn } from '@/client/lib/cn'
import type { ScrollView } from '@/shared/frame-bridge/messages'

import { subscribe } from '../bridge/channel'
import { followPage } from '../bridge/shown'
import { holdScrollView } from './page'

/**
 * Follows where a frame's page shows as its bridge pushes it, answering null
 * while nothing scrolls or the page has not answered. A drag draws from the
 * page's own pushes, never from its requests, so the thumb follows the page.
 */
function useScrollView(
  iframe: RefObject<HTMLIFrameElement | null>,
  live: boolean,
): ScrollView | null {
  const [view, setView] = useState<ScrollView | null>(null)
  useEffect(() => {
    const element = iframe.current
    if (!live || !element) return
    const show = (next: ScrollView | null) => {
      holdScrollView(element, next)
      setView((was) =>
        was?.top === next?.top && was?.size === next?.size ? was : next,
      )
    }
    const stop = followPage(element, () => {
      let open = true
      const followed = subscribe(element, 'scroll', {}, show)
      void followed.opened.then((first) => {
        if (open) show(first)
      })
      return () => {
        open = false
        followed.close()
        show(null)
      }
    })
    return () => {
      stop()
      holdScrollView(element, null)
    }
  }, [iframe, live])
  return view
}

interface ScrollRailProps {
  /** The iframe whose page the rail shows and scrolls. */
  iframe: RefObject<HTMLIFrameElement | null>
  live: boolean
  /** When the rail shows, as classes on the rail, since the frame's label hover and selection decide it. */
  className?: string
  /** Board units the rail stands further out, past a device body drawn around the frame. */
  inset?: number
}

/**
 * A scroll frame's rail per `canon/design/canvas/scroll-rail`, reached through
 * `pressRail`, since the hit layer covers it.
 */
export function ScrollRail({
  iframe,
  live,
  className,
  inset = 0,
}: ScrollRailProps) {
  const view = useScrollView(iframe, live)
  if (!view) return null
  return (
    <div
      aria-hidden
      data-rail
      className={cn(
        'absolute top-0 h-full rounded-[calc(3px/var(--zoom,1))] bg-[color-mix(in_srgb,var(--foreground)_9%,transparent)] data-dragging:visible',
        className,
      )}
      style={{
        left: `calc(100% + ${inset}px + 8px / var(--zoom, 1))`,
        width: 'calc(6px / var(--zoom, 1))',
      }}
    >
      <div
        data-rail-thumb
        className="absolute inset-x-0 rounded-[calc(3px/var(--zoom,1))] bg-muted-foreground [[data-dragging]>&]:bg-primary"
        style={{ top: `${view.top * 100}%`, height: `${view.size * 100}%` }}
      />
    </div>
  )
}
