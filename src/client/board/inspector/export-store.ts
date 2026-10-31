import { createStore, type StoreApi } from 'zustand/vanilla'

import type { FrameRecord } from '@/shared/records/list'
import { type Theme, THEMES } from '@/shared/theme'

export type ExportScale = 1 | 2 | 3
export type ExportTheme = Theme | 'both'

export const SCALES: readonly ExportScale[] = [1, 2, 3]
export const THEME_OPTIONS: readonly { value: ExportTheme; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'both', label: 'Both themes' },
]

export interface ExportSettings {
  scale: ExportScale
  theme: ExportTheme
}

/** The scale and theme the Export section last picked, carried across frames for the session, which the palette's Export as PNG exports at too. */
export const exportStore: StoreApi<ExportSettings> =
  createStore<ExportSettings>()(() => ({
    scale: 2,
    theme: 'both',
  }))

/** The files an export saves, one per theme, in the form `capture` names a scaled image. */
export function exportFileNames(
  frame: string,
  { scale, theme }: ExportSettings,
): string[] {
  return themesOf(theme).map((one) => `${frame}.${one}@${scale}x.png`)
}

/**
 * Downloads one frame's PNG at a scale, in one theme or both. Every theme
 * renders through the board's PNG route before any file downloads, so a
 * refusal on one leaves nothing half saved. It writes nothing to the board,
 * so a view-only tab exports too.
 */
export async function exportFrame(
  frame: Pick<FrameRecord, 'ref' | 'name'>,
  settings: ExportSettings,
): Promise<void> {
  const files = exportFileNames(frame.name, settings)
  const blobs = await renderThemes(
    frame.ref,
    themesOf(settings.theme),
    settings.scale,
  )
  blobs.forEach((blob, index) => download(blob, files[index] ?? ''))
}

function themesOf(theme: ExportTheme): readonly Theme[] {
  return theme === 'both' ? THEMES : [theme]
}

/** Renders every theme in turn, refusing with the route's own message on the first that fails. */
async function renderThemes(
  ref: string,
  themes: readonly Theme[],
  scale: ExportScale,
): Promise<Blob[]> {
  const blobs: Blob[] = []
  // In turn, since the route renders one at a time whatever is asked of it.
  for (const theme of themes) {
    const query = new URLSearchParams({ ref, theme, scale: String(scale) })
    const response = await fetch(`/api/frames/png?${query}`)
    if (!response.ok) throw new Error(await refusalOf(response))
    blobs.push(await response.blob())
  }
  return blobs
}

async function refusalOf(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => null)
  if (
    typeof body === 'object' &&
    body !== null &&
    'error' in body &&
    typeof body.error === 'object' &&
    body.error !== null &&
    'message' in body.error &&
    typeof body.error.message === 'string'
  ) {
    return body.error.message
  }
  return `The board answered ${response.status}.`
}

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  // The click has already handed the blob to the download, so the URL can go.
  URL.revokeObjectURL(url)
}
