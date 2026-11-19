import { useCallback, useSyncExternalStore } from 'react'
import { useStore } from 'zustand'

import { useLive } from '@/client/live/store'
import { turnsWith } from '@/shared/frame-device'
import type { FrameRecord } from '@/shared/records/list'

import { RotateLabel } from '../device/poses'
import { rotateFrame, turnRefusal } from '../device/turn'
import { enteredStore } from '../play/entered'
import { pageReach } from '../play/reach'

/** A frame's load reaches a capturing listener on its host document, though it never bubbles. */
function onFrameLoad(listener: () => void): () => void {
  document.addEventListener('load', listener, true)
  return () => document.removeEventListener('load', listener, true)
}

/**
 * The Play notice, saying nothing takes a click only once it has read every
 * shown frame, so a culled one never lets it claim so, and offering Rotate
 * to a writer while a phone or tablet is entered.
 */
export function PlayBanner({ frames }: { frames: readonly FrameRecord[] }) {
  const reach = useSyncExternalStore(
    onFrameLoad,
    useCallback(() => pageReach(frames), [frames]),
    () => 'unread' as const,
  )
  const enteredRef = useStore(enteredStore, (state) => state.ref)
  const canWrite = useLive((state) => state.canWrite)
  const entered = frames.find((frame) => frame.ref === enteredRef)
  const turnable = entered && canWrite && turnsWith(entered.device)
  const off = entered ? turnRefusal(entered) : undefined
  return (
    <div className="pointer-events-none absolute top-3.5 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2.5 rounded-[14px] bg-primary-fill px-3 py-1.5 font-medium whitespace-nowrap text-primary-foreground">
      <p role="status" className="flex flex-col items-center">
        <span>Playing. Click a frame to use it. Esc to edit</span>
        {reach === 'static' ? (
          <span className="font-normal">
            Nothing on this page takes a click
          </span>
        ) : null}
      </p>
      {turnable ? (
        <button
          type="button"
          aria-disabled={off ? true : undefined}
          title={off}
          onClick={() => {
            if (!off) rotateFrame(entered)
          }}
          className="pointer-events-auto flex items-center gap-1 rounded-[7px] bg-white/18 px-2 py-0.5 outline-none hover:bg-white/28 focus-visible:ring-2 focus-visible:ring-primary-foreground aria-disabled:opacity-60 aria-disabled:hover:bg-white/18"
        >
          <RotateLabel />
        </button>
      ) : null}
    </div>
  )
}
