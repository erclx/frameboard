import type { Theme } from '@/shared/theme'

/** The address of a frame's stored thumbnail at `stamp`, which home and the slide overview both draw. */
export function thumbnailUrl(ref: string, theme: Theme, stamp: string): string {
  return `/api/thumbnails/png?${new URLSearchParams({ ref, theme, v: stamp })}`
}
