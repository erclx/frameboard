import { frameUrl } from '@/shared/board-urls'
import { frameThemeUrl, type Theme } from '@/shared/theme'

import { type LiveState, liveStore, useLive } from './store'

/**
 * The features a live frame's iframe delegates, being every one whose default
 * is `self` that a prototype reaches for, since a frame on its own port is
 * cross-origin and inherits none of them without `allow`.
 */
export const FRAME_ALLOW = [
  'autoplay',
  'fullscreen',
  'clipboard-read',
  'clipboard-write',
  'camera',
  'microphone',
  'geolocation',
  'accelerometer',
  'gyroscope',
  'magnetometer',
  'xr-spatial-tracking',
  'web-share',
  'screen-wake-lock',
].join('; ')

/**
 * The loopback name a tab on `hostname` loads frames from, since a browser
 * counts the two as different sites and gives the other a process of its own.
 * Null for a tab on neither, which has no second name.
 */
export function otherLoopback(hostname: string): string | null {
  if (hostname === 'localhost') return '127.0.0.1'
  if (hostname === '127.0.0.1') return 'localhost'
  return null
}

/** The origin frames load from, null until the socket settles it. */
export function frameOriginOf({
  framePort,
  frameHost,
}: Pick<LiveState, 'framePort' | 'frameHost'>): string | null {
  return framePort === null || frameHost === null
    ? null
    : `http://${frameHost}:${framePort}`
}

export function useFrameOrigin(): string | null {
  return useLive(frameOriginOf)
}

export function onFramePort(
  path: string,
  origin: string | null,
): string | null {
  return origin === null ? null : `${origin}${path}`
}

/** A frame's page in one theme on the frame port, null until its origin is settled. */
export function framePageUrl(
  origin: string | null,
  ref: string,
  theme: Theme,
  version?: number,
  at?: string,
): string | null {
  return onFramePort(frameThemeUrl(ref, theme, version, at), origin)
}

/** A frame's bare page on the frame port, as Open alone links it, null until its origin is settled. */
export function frameAloneUrl(
  origin: string | null,
  ref: string,
): string | null {
  return onFramePort(frameUrl(ref), origin)
}

/**
 * A path on the frame port as it stands now, for a read outside render. Before
 * the origin settles it stays relative, which the board's port redirects.
 */
export function heldFramePath(path: string): string {
  return onFramePort(path, frameOriginOf(liveStore.getState())) ?? path
}
