import type {
  FileFlag,
  MediaAct,
  MediaReading,
} from '@/shared/frame-bridge/media'

import { request } from '../bridge/channel'
import type { ElementKey } from '../selection'
import { useLiveReading } from './live-reading'

/**
 * A live media element's reading and the acts on it. Every act moves the
 * live page alone and writes nothing, so an agent never sees a listen.
 */
export interface LiveMedia {
  reading: MediaReading
  togglePlay: () => void
  seek: (seconds: number) => void
  toggleSound: () => void
  /** Shows a file switch's write on the live node, which the write then saves. */
  setFileFlag: (name: FileFlag, on: boolean) => void
}

/**
 * The selected media as its frame's page pushes it on every playback change,
 * held through a hand edit's reload as `useLiveReading` holds it.
 */
export function useLiveMedia(key: ElementKey | null): LiveMedia | null {
  const held = useLiveReading(key, 'media')
  if (!held || !key) return null
  const { iframe, hash, reading } = held
  const send = (act: MediaAct) =>
    void request(iframe, 'media-act', { index: key.index, hash, act })
  return {
    reading,
    togglePlay: () => send({ kind: 'toggle-play' }),
    seek: (seconds) => send({ kind: 'seek', seconds }),
    toggleSound: () => send({ kind: 'toggle-sound' }),
    setFileFlag: (name, on) => send({ kind: 'set-flag', name, on }),
  }
}
