import { type RefObject, useEffect, useState } from 'react'

import { cn } from '@/client/lib/cn'

import { readPage, type ScrollView, scrollViewOf } from './page'

/** Follows a frame page's scroll, answering null while nothing scrolls. */
function useScrollView(
  iframe: RefObject<HTMLIFrameElement | null>,
  live: boolean,
): ScrollView | null {
  const [view, setView] = useState<ScrollView | null>(null)
  useEffect(() => {
    const element = iframe.current
    if (!live || !element) return
    let stop = () => {}
    const read = () => {
      const next = scrollViewOf(element)
      setView((was) =>
        was?.top === next?.top && was?.size === next?.size ? was : next,
      )
    }
    const follow = () => {
      stop()
      read()
      const page = readPage(element)
      if (!page) return
      const resized = new ResizeObserver(read)
      resized.observe(page.root)
      page.window.addEventListener('scroll', read)
      page.window.addEventListener('resize', read)
      stop = () => {
        resized.disconnect()
        page.window.removeEventListener('scroll', read)
        page.window.removeEventListener('resize', read)
      }
    }
    follow()
    element.addEventListener('load', follow)
    return () => {
      element.removeEventListener('load', follow)
      stop()
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
}

/**
 * A scroll frame's rail on the canvas, 6px wide and 8px right of the box at
 * any zoom, its thumb the share of the page in view, as
 * `canon/design/canvas/scroll-rail` draws it. It draws nothing while the page
 * fits its box or cannot be read. The hit layer covers it, so a press reaches
 * it through `pressRail`, and the wheel over it pans the board.
 */
export function ScrollRail({ iframe, live, className }: ScrollRailProps) {
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
        left: 'calc(100% + 8px / var(--zoom, 1))',
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
