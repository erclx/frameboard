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
  /** Whether a frame holding a device exports inside it, off unless picked. */
  device?: boolean
}

/** The scale, theme, and device switch the Export section last picked, carried across frames for the session, which the palette's Export as PNG exports at too. */
export const exportStore: StoreApi<ExportSettings> =
  createStore<ExportSettings>()(() => ({
    scale: 2,
    theme: 'both',
    device: false,
  }))

/** The files an export saves, one per theme, in the form `capture` names a scaled image. */
export function exportFileNames(
  frame: string,
  { scale, theme }: ExportSettings,
): string[] {
  return themesOf(theme).map((one) => `${frame}.${one}@${scale}x.png`)
}

/**
 * The exported files' name, separators turned to dashes and leading dots
 * dropped so a download never names a folder or a hidden file.
 */
export function exportBaseName(typed: string, fallback: string): string {
  const cleaned = typed
    .replace(/[/\\]+/g, '-')
    .replace(/^[\s.-]+/, '')
    .trim()
  return cleaned === '' ? fallback : cleaned
}

/** The name an element's files start as, `<frame>-<element>` in kebab case, so two elements of one frame differ. */
export function elementExportName(frame: string, element: string): string {
  const kebab = element
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
  return `${frame}-${kebab === '' ? 'element' : kebab}`
}

/** One element of a frame, as the address `edit` takes. */
export interface ExportElement {
  index: number
  /** The content hash of the frame file the index was read against. */
  hash: string
}

/**
 * Downloads a frame's or `element`'s PNG. Every theme renders before any file
 * downloads, so a refusal leaves nothing half saved, and it writes nothing, so
 * a view-only tab exports too.
 */
export async function exportFrame(
  frame: Pick<FrameRecord, 'ref' | 'name' | 'device'>,
  settings: ExportSettings,
  name = '',
  element?: ExportElement,
): Promise<void> {
  const files = exportFileNames(exportBaseName(name, frame.name), settings)
  const blobs = await renderThemes(
    frame.ref,
    themesOf(settings.theme),
    settings.scale,
    element
      ? { element: String(element.index), hash: element.hash }
      : settings.device && frame.device
        ? { device: '1' }
        : {},
  )
  blobs.forEach((blob, index) => download(blob, files[index] ?? ''))
}

/** The files a filmstrip export saves, one per theme, in the form `capture --filmstrip` names one. */
export function filmstripFileNames(
  frame: string,
  count: number,
  { scale, theme }: ExportSettings,
): string[] {
  return themesOf(theme).map(
    (one) => `${frame}.filmstrip-${count}.${one}@${scale}x.png`,
  )
}

/**
 * Downloads a frame's filmstrip, rendering every theme before any file
 * downloads, so a refusal leaves nothing half saved.
 */
export async function exportFilmstrip(
  frame: Pick<FrameRecord, 'ref' | 'name'>,
  count: number,
  settings: ExportSettings,
): Promise<void> {
  const files = filmstripFileNames(frame.name, count, settings)
  const blobs = await renderThemes(
    frame.ref,
    themesOf(settings.theme),
    settings.scale,
    { filmstrip: String(count) },
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
  extra: Record<string, string> = {},
): Promise<Blob[]> {
  const blobs: Blob[] = []
  // In turn, since the route renders one at a time whatever is asked of it.
  for (const theme of themes) {
    const query = new URLSearchParams({
      ref,
      theme,
      scale: String(scale),
      ...extra,
    })
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
