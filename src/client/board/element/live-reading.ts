import { useEffect, useState } from 'react'

import type { BridgeOps } from '@/shared/frame-bridge/messages'

import { subscribe } from '../bridge/channel'
import { followFrame, shownHashOf } from '../bridge/shown'
import type { ElementKey } from '../selection'

/** The ops that push one element's reading on every change, null for no such element. */
type ReadingOp = 'media' | 'model'

type ReadingOf<O extends ReadingOp> = NonNullable<BridgeOps[O]['value']>

/** A live element's reading and the page it was read on. */
export interface LiveReading<R> {
  iframe: HTMLIFrameElement
  /** The bytes it was read at, which an act names, so one never reaches a reloaded page's node. */
  hash: string
  reading: R
}

/**
 * The selected element's reading as its frame's page pushes it under `op`,
 * held while the page shows older bytes than the key's hash, so its section
 * keeps its place between a hand edit and its reload.
 */
export function useLiveReading<O extends ReadingOp>(
  key: ElementKey | null,
  op: O,
): LiveReading<ReadingOf<O>> | null {
  const [held, setHeld] = useState<
    ({ at: string } & LiveReading<ReadingOf<O>>) | null
  >(null)
  const frame = key?.frame
  const index = key?.index
  const hash = key?.hash
  const at = key ? `${frame}:${index}` : null
  useEffect(() => {
    if (at === null || frame === undefined || index === undefined) return
    if (hash === undefined) return
    return followFrame(
      document.body,
      frame,
      (iframe) => {
        const shown = shownHashOf(iframe)
        if (shown === null) return () => {}
        // A page at older bytes only refreshes the reading held for the node on screen.
        const stale = shown !== hash
        let live = true
        const hold = (reading: BridgeOps[O]['value']) => {
          if (!live) return
          const next = reading ? { at, iframe, hash: shown, reading } : null
          if (!stale) setHeld(next)
          else if (next) setHeld((last) => (last?.at === at ? next : last))
        }
        const pushed = subscribe(iframe, op, { index, hash: shown }, hold)
        void pushed.opened.then(hold)
        return () => {
          live = false
          pushed.close()
        }
      },
      // A placeholder shows no page, so it holds no element.
      () => setHeld(null),
    )
  }, [at, frame, index, hash, op])
  return held && held.at === at ? held : null
}
