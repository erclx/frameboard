import { frameUrl } from '@/shared/board-urls'
import { frameThemeUrl, type Theme } from '@/shared/theme'

import { liveStore, useLive } from './store'

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
 * `path` on the frame port, on the tab's own hostname, since `localhost` and
 * `127.0.0.1` are different sites and a frame on the other would be
 * cross-site. Null before the socket hands the port over.
 */
export function onFramePort(
  path: string,
  port: number | null,
  hostname = location.hostname,
): string | null {
  return port === null ? null : `http://${hostname}:${port}${path}`
}

/** The frame port the socket last handed over, null until its first hello. */
export function useFramePort(): number | null {
  return useLive((state) => state.framePort)
}

/** A frame's page in one theme on the frame port, null until the port is held. */
export function framePageUrl(
  port: number | null,
  ref: string,
  theme: Theme,
  version?: number,
  at?: string,
): string | null {
  return onFramePort(frameThemeUrl(ref, theme, version, at), port)
}

/** A frame's bare page on the frame port, as Open alone links it, null until the port is held. */
export function frameAloneUrl(port: number | null, ref: string): string | null {
  return onFramePort(frameUrl(ref), port)
}

/**
 * A path on the frame port as it stands now, for a read outside render. Before
 * the port arrives it stays relative, which the board's port redirects.
 */
export function heldFramePath(path: string): string {
  return onFramePort(path, liveStore.getState().framePort) ?? path
}
