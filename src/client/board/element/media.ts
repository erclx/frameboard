import { useEffect, useState } from 'react'

import type { MediaAct, MediaReading } from '@/shared/frame-bridge/media'

import { request, subscribe } from '../bridge/channel'
import { followFrame, shownHashOf } from '../bridge/shown'
import type { ElementKey } from '../selection'

/**
 * A live media element's reading and the acts on it. Every act moves the
 * live page alone and writes nothing, so an agent never sees a listen.
 */
export interface LiveMedia {
  reading: MediaReading
  togglePlay: () => void
  seek: (seconds: number) => void
  toggleSound: () => void
}

/**
 * The selected media as its frame's page pushes it, read again on every
 * playback change and held while the frame shows older bytes than the key's
 * hash, so the Video section keeps its place between a hand edit and its
 * reload.
 */
export function useLiveMedia(key: ElementKey | null): LiveMedia | null {
  const [held, setHeld] = useState<{
    at: string
    iframe: HTMLIFrameElement
    /** The bytes it was read at, which its acts name, so one never reaches a reloaded page's node. */
    hash: string
    reading: MediaReading
  } | null>(null)
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
        const hold = (reading: MediaReading | null) => {
          if (!live) return
          const next = reading ? { at, iframe, hash: shown, reading } : null
          if (!stale) setHeld(next)
          else if (next) setHeld((last) => (last?.at === at ? next : last))
        }
        const media = subscribe(iframe, 'media', { index, hash: shown }, hold)
        void media.opened.then(hold)
        return () => {
          live = false
          media.close()
        }
      },
      // A placeholder shows no page, so it holds no media.
      () => setHeld(null),
    )
  }, [at, frame, index, hash])
  if (!held || held.at !== at || index === undefined) return null
  const { iframe } = held
  const send = (act: MediaAct) =>
    void request(iframe, 'media-act', { index, hash: held.hash, act })
  return {
    reading: held.reading,
    togglePlay: () => send({ kind: 'toggle-play' }),
    seek: (seconds) => send({ kind: 'seek', seconds }),
    toggleSound: () => send({ kind: 'toggle-sound' }),
  }
}
