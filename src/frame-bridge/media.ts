import type { MediaAct, MediaReading } from '@/shared/frame-bridge/media'
import { LOOK_MARKER } from '@/shared/theme'

import { addressed, type Handlers } from './handler'

const EVENTS = [
  'play',
  'pause',
  'timeupdate',
  'durationchange',
  'loadedmetadata',
  'volumechange',
  'seeked',
  'error',
  'emptied',
] as const

/** The `<video>` or `<audio>` an address names, or null for other bytes or no media there. */
function mediaAt(address: {
  index: number
  hash: string
}): HTMLMediaElement | null {
  const target = addressed(address)
  return target instanceof HTMLMediaElement ? target : null
}

function readMedia(media: HTMLMediaElement): MediaReading {
  const video = media instanceof HTMLVideoElement
  const blank = video && media.readyState >= 1 && media.videoWidth === 0
  return {
    tag: video ? 'video' : 'audio',
    playable: media.error === null && !blank,
    paused: media.paused,
    time: media.currentTime,
    length: media.duration,
    muted: media.muted,
    mutedInFile: media.defaultMuted,
    controls: media.hasAttribute('controls'),
    autoplay: media.hasAttribute('autoplay'),
    loop: media.hasAttribute('loop'),
  }
}

function act(media: HTMLMediaElement, asked: MediaAct): void {
  switch (asked.kind) {
    case 'toggle-play':
      // A play the page refuses leaves it paused, which the reading shows.
      if (media.paused) media.play().catch(() => undefined)
      else media.pause()
      return
    case 'seek':
      media.currentTime = asked.seconds
      return
    case 'toggle-sound':
      media.muted = !media.muted
  }
}

const STRIP_ID = 'frameboard-media-strip'

/**
 * Hides the strip the browser draws for `controls` on every video by one
 * injected style, answering its undo. The strip grows with the frame's zoom
 * and the board's bar never does, so the bar cannot cover it.
 */
function hideStrips(): () => void {
  if (document.getElementById(STRIP_ID)) return () => {}
  const style = document.createElement('style')
  style.id = STRIP_ID
  // Marked as the board's own, so no element's file index moves.
  style.setAttribute(LOOK_MARKER, '')
  style.textContent =
    'video::-webkit-media-controls { display: none !important }'
  document.head?.append(style)
  return () => style.remove()
}

export const mediaHandlers: Handlers = {
  media: (address, { push, onClose }) => {
    const media = mediaAt(address)
    if (!media) return null
    const read = () => push(readMedia(media))
    for (const name of EVENTS) media.addEventListener(name, read)
    onClose(() => {
      for (const name of EVENTS) media.removeEventListener(name, read)
    })
    return readMedia(media)
  },
  'media-act': ({ act: asked, ...address }) => {
    const media = mediaAt(address)
    if (!media) return false
    act(media, asked)
    return true
  },
  'hide-strips': (_args, { onClose }) => {
    onClose(hideStrips())
    return true
  },
}
