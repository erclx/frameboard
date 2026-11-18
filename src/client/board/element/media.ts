import { useEffect, useState } from 'react'

import { elementAt, renderedHash } from '@/shared/frame-bridge/elements'

import type { ElementKey } from '../selection'

/** A selected `<video>` or `<audio>` as its frame's live page plays it. */
export interface MediaReading {
  tag: 'video' | 'audio'
  /** False once the browser cannot decode the file, or a video decodes no picture. */
  playable: boolean
  paused: boolean
  /** The position in seconds. */
  time: number
  /** The length in seconds, `NaN` until the metadata loads. */
  length: number
  /** Whether the live page is silent now, which a listen flips and nothing writes. */
  muted: boolean
  /** Whether the file states `muted`, which only a written edit changes. */
  mutedInFile: boolean
  /** Whether the file states `controls`, so the page draws the browser's own strip. */
  controls: boolean
  /** Whether the file states `autoplay`, which a browser honors only beside `muted`. */
  autoplay: boolean
  /** Whether the file states `loop`. */
  loop: boolean
}

/**
 * A live media element's reading and the acts on it. Every act moves the
 * live page alone and writes nothing, so an agent never sees a listen.
 */
export interface LiveMedia {
  reading: MediaReading
  /** The live page the element sits in, for a style the board lays over it. */
  page: Document
  togglePlay: () => void
  seek: (seconds: number) => void
  toggleSound: () => void
}

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

/**
 * The `<video>` or `<audio>` at `index` in the live page under `host`, the
 * frame's `[data-frame]` box, or null when the frame is a placeholder, shows
 * other bytes than `hash`, or holds no media element there.
 */
export function mediaAt(
  host: Element,
  index: number,
  hash: string,
): HTMLMediaElement | null {
  const document =
    host.querySelector<HTMLIFrameElement>(':scope > iframe')?.contentDocument
  const view = document?.defaultView
  if (!document || !view || renderedHash(document) !== hash) return null
  const target = elementAt(document, index)
  // The element comes from the frame's own window, so its classes are that window's.
  return target instanceof view.HTMLMediaElement ? target : null
}

export function readMedia(media: HTMLMediaElement): MediaReading {
  const view = media.ownerDocument.defaultView
  const video = view !== null && media instanceof view.HTMLVideoElement
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

/**
 * The selected media as a live element, re-read on every playback change and
 * held while the frame shows older bytes than the key's hash, so the Video
 * section keeps its place between a hand edit and its reload.
 */
export function useLiveMedia(key: ElementKey | null): LiveMedia | null {
  const [held, setHeld] = useState<{
    at: string
    media: HTMLMediaElement
    reading: MediaReading
  } | null>(null)
  const frame = key?.frame
  const index = key?.index
  const hash = key?.hash
  const at = key ? `${frame}:${index}` : null
  useEffect(() => {
    if (at === null || frame === undefined || index === undefined) return
    if (hash === undefined) return
    const host = document.querySelector(`[data-frame="${CSS.escape(frame)}"]`)
    if (!host) return
    let media: HTMLMediaElement | null = null
    // True while the frame shows older bytes, so a read only refreshes the held node.
    let stale = false
    const read = () => {
      if (!media) return
      const next = { at, media, reading: readMedia(media) }
      if (stale) {
        setHeld((last) =>
          last?.at === at && last.media === next.media ? next : last,
        )
      } else {
        setHeld(next)
      }
    }
    const resolve = () => {
      const page =
        host.querySelector<HTMLIFrameElement>(
          ':scope > iframe',
        )?.contentDocument
      const shown = page ? renderedHash(page) : null
      // A placeholder has no page, so it falls through to the release below.
      stale = page !== null && page !== undefined && shown !== hash
      // A stale page's own hash finds the node on screen, an unstamped page nothing.
      const showing = stale ? shown : hash
      const found = showing === null ? null : mediaAt(host, index, showing)
      if (found === media) return
      for (const name of EVENTS) media?.removeEventListener(name, read)
      media = found
      if (!media) {
        if (!stale) setHeld(null)
        return
      }
      for (const name of EVENTS) media.addEventListener(name, read)
      read()
    }
    resolve()
    // A swap shows as a child change, and a load is captured since it never bubbles.
    const swaps = new MutationObserver(resolve)
    swaps.observe(host, { childList: true })
    host.addEventListener('load', resolve, true)
    return () => {
      swaps.disconnect()
      host.removeEventListener('load', resolve, true)
      for (const name of EVENTS) media?.removeEventListener(name, read)
    }
  }, [at, frame, index, hash])
  if (!held || held.at !== at) return null
  const { media } = held
  return {
    reading: held.reading,
    page: media.ownerDocument,
    togglePlay: () => togglePlay(media),
    seek: (seconds) => seek(media, seconds),
    toggleSound: () => toggleSound(media),
  }
}

// The acts take the element as an argument, since it is the frame's live
// node, which the board drives in place, rather than state this hook owns.

function togglePlay(media: HTMLMediaElement): void {
  // A play the page refuses leaves it paused, which the reading shows.
  if (media.paused) media.play().catch(() => undefined)
  else media.pause()
}

function seek(media: HTMLMediaElement, seconds: number): void {
  media.currentTime = seconds
}

function toggleSound(media: HTMLMediaElement): void {
  media.muted = !media.muted
}
