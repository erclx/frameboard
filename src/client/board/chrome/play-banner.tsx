import { useCallback, useSyncExternalStore } from 'react'

import type { FrameRecord } from '@/shared/records/list'

import { pageReach, watchReach } from '../play/reach'

/**
 * The notice centered atop the canvas column while the board is in Play. It
 * adds that nothing takes a click only once every shown frame answered, so
 * a culled or loading frame never lets it claim so.
 */
export function PlayBanner({ frames }: { frames: readonly FrameRecord[] }) {
  const reach = useSyncExternalStore(
    watchReach,
    useCallback(() => pageReach(frames), [frames]),
    () => 'unread' as const,
  )
  return (
    <p
      role="status"
      className="pointer-events-none absolute top-3.5 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center rounded-[14px] bg-primary-fill px-3 py-1.5 font-medium whitespace-nowrap text-primary-foreground"
    >
      <span>Playing. Click a frame to use it. Esc to edit</span>
      {reach === 'static' ? (
        <span className="font-normal">Nothing on this page takes a click</span>
      ) : null}
    </p>
  )
}
