import { useCallback, useSyncExternalStore } from 'react'

import type { FrameRecord } from '@/shared/records/list'

import { pageReach } from '../play-reach'

/** A frame's load reaches a capturing listener on its host document, though it never bubbles. */
function onFrameLoad(listener: () => void): () => void {
  document.addEventListener('load', listener, true)
  return () => document.removeEventListener('load', listener, true)
}

/**
 * The notice centered atop the canvas column while the board is in Play. It
 * adds that nothing takes a click only once it has read every shown frame,
 * so a culled frame it could not read never lets it claim so.
 */
export function PlayBanner({ frames }: { frames: readonly FrameRecord[] }) {
  const reach = useSyncExternalStore(
    onFrameLoad,
    useCallback(() => pageReach(frames), [frames]),
    () => 'unread' as const,
  )
  return (
    <p
      role="status"
      className="pointer-events-none absolute top-3.5 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center rounded-[14px] bg-primary px-3 py-1.5 font-medium whitespace-nowrap text-primary-foreground"
    >
      <span>Playing. Clicks go to the frames. Esc to edit</span>
      {reach === 'static' ? (
        <span className="font-normal">Nothing on this page takes a click</span>
      ) : null}
    </p>
  )
}
