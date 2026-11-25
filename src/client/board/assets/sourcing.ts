import { useEffect, useState } from 'react'
import { createStore } from 'zustand/vanilla'

import { useLive } from '@/client/live/store'
import { BoardWriteError, writeBoard } from '@/client/live/write'
import { FONT_CATEGORIES, FONT_SHEET, type FontCategory } from '@/shared/fonts'
import type {
  FontFind,
  FontList,
  ImageFind,
  ImageGenerate,
  ImageOffer,
  ImageResult,
  ModelFind,
  ModelResult,
  SavedImage,
} from '@/shared/records/sourcing'

import { assetUrl } from './describe'

export type {
  ImageFind,
  ImageGenerate,
  ImageOffer,
  ImageResult,
  ModelFind,
  ModelResult,
  SavedImage,
}

/** What a found result is, which picks the route that saves it. */
export type ResultKind = 'image' | 'model'

function base(project: string): string {
  return `/api/projects/${encodeURIComponent(project)}/sourcing`
}

type Envelope<T> =
  | { ok: true; data: T }
  | {
      ok: false
      error: {
        code: string
        message: string
        details?: Record<string, unknown>
      }
    }

/**
 * One page of Openverse results through the board's server. A refusal throws
 * `BoardWriteError` with the code and details the route answered, an abort
 * throws the signal's own error.
 */
export async function findImages(
  project: string,
  query: string,
  credited: boolean,
  signal?: AbortSignal,
): Promise<ImageFind> {
  const params = new URLSearchParams({ q: query })
  if (credited) params.set('credited', 'true')
  return read<ImageFind>(`${base(project)}/find?${params}`, signal)
}

/**
 * Poly Haven's models matching a query through the board's server, refusing
 * and aborting as `findImages` does.
 */
export function findModels(
  project: string,
  query: string,
  signal?: AbortSignal,
): Promise<ModelFind> {
  const params = new URLSearchParams({ q: query })
  return read<ModelFind>(`${base(project)}/models?${params}`, signal)
}

/**
 * Fontsource's families matching typed text, refusing and aborting as
 * `findImages` does. Text naming a category asks for it alone, since `serif`
 * as a name opens a word in dozens of families.
 */
export function findFonts(
  project: string,
  text: string,
  signal?: AbortSignal,
): Promise<FontFind> {
  const typed = text.trim()
  const params = new URLSearchParams(
    isCategory(typed.toLowerCase())
      ? { category: typed.toLowerCase() }
      : { q: typed },
  )
  return read<FontFind>(`${base(project)}/fonts?${params}`, signal)
}

function isCategory(text: string): text is FontCategory {
  return (FONT_CATEGORIES as readonly string[]).includes(text)
}

/**
 * The fonts a project installed, without the frames naming each, since reading
 * those parses every frame. Null when the read is refused, and an abort throws.
 */
export async function fetchInstalledFonts(
  project: string,
  signal?: AbortSignal,
): Promise<FontList | null> {
  try {
    return await read<FontList>(
      `${base(project)}/fonts/installed?frames=false`,
      signal,
    )
  } catch (error) {
    if (signal?.aborted) throw error
    return null
  }
}

/** The frames drawing text in one installed font, read as a removal asks. Refuses as `findImages` does. */
export async function fetchFontFrames(
  project: string,
  id: string,
): Promise<readonly string[]> {
  const list = await read<FontList>(`${base(project)}/fonts/installed`)
  return list.fonts.find((font) => font.id === id)?.frames ?? []
}

/**
 * The sheet declaring a project's installed fonts, addressed by what it holds
 * so the browser reads it again once a family is installed or removed.
 */
export function installedFontSheet(list: FontList): string {
  const held = list.fonts.map((font) => font.id).join(',')
  return `/frames/${encodeURIComponent(list.project)}/${FONT_SHEET}?fonts=${encodeURIComponent(held)}`
}

/** Reads a project's installed fonts, aborting on the signal. */
export type InstalledFontsRead = (
  project: string,
  signal?: AbortSignal,
) => Promise<FontList | null>

/**
 * The project's installed fonts, read again whenever the live board changes,
 * which a font's install or removal does, aborting the read a newer one
 * supersedes. Undefined while the first read runs.
 */
export function useInstalledFonts(
  project: string,
  load: InstalledFontsRead = fetchInstalledFonts,
): FontList | null | undefined {
  const board = useLive((state) => state.board)
  const [list, setList] = useState<FontList | null | undefined>()
  useEffect(() => {
    const abort = new AbortController()
    load(project, abort.signal)
      .catch(() => null)
      .then((next) => {
        if (!abort.signal.aborted) setList(next)
      })
    return () => abort.abort()
  }, [project, board, load])
  return list
}

async function read<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal })
  const body = (await response.json().catch(() => null)) as Envelope<T> | null
  if (body === null) {
    throw new BoardWriteError(
      'internal',
      `The board answered ${response.status}.`,
    )
  }
  if (!body.ok) {
    throw new BoardWriteError(
      body.error.code,
      body.error.message,
      body.error.details,
    )
  }
  return body.data
}

/** The provider Generate would run on and its price, null when the read fails. */
export async function fetchOffer(project: string): Promise<ImageOffer | null> {
  const response = await fetch(`${base(project)}/provider`)
  const body = (await response
    .json()
    .catch(() => null)) as Envelope<ImageOffer> | null
  return body?.ok ? body.data : null
}

/** Generates an image and saves it into the project's `assets/`, the one call that spends. */
export function generateImage(
  project: string,
  prompt: string,
): Promise<ImageGenerate> {
  return writeBoard<ImageGenerate>(`${base(project)}/generate`, { prompt })
}

/** Where one result's save stands, absent until it is first saved. */
export type SaveState =
  | { state: 'saving' }
  | { state: 'saved'; path: string }
  | { state: 'failed'; message: string }

/**
 * Each result's save by `project`, kind, and source id, so Save and Insert
 * share one and an image and a model sharing an id never do.
 */
export const saveStore = createStore<Record<string, SaveState>>()(() => ({}))

export function saveKey(
  project: string,
  id: string,
  kind: ResultKind = 'image',
): string {
  return `${project}\0${kind}\0${id}`
}

export interface SaveRequest {
  project: string
  result: Pick<ImageResult, 'id'>
  /** The search that found it, which names the saved file. */
  query: string
  credited: boolean
  /** An image unless named, which saves through Openverse. */
  kind?: ResultKind
}

const pending = new Map<string, Promise<SavedImage>>()
const landed = new Map<string, SavedImage>()

/** Whether the board still serves a file under the project's `assets/`. */
export async function assetExists(
  project: string,
  path: string,
): Promise<boolean> {
  try {
    return (await fetch(assetUrl(project, path), { method: 'HEAD' })).ok
  } catch {
    return false
  }
}

/**
 * Saves a found result into the project's `assets/` once: a second call while
 * the first runs, or after it landed while its file is still there, answers
 * the same file rather than writing another.
 */
export function saveResult(
  { project, result, query, credited, kind = 'image' }: SaveRequest,
  send: typeof writeBoard<SavedImage> = writeBoard,
  exists: typeof assetExists = assetExists,
): Promise<SavedImage> {
  const key = saveKey(project, result.id, kind)
  const running = pending.get(key)
  if (running) return running
  const set = (state: SaveState) =>
    saveStore.setState((current) => ({ ...current, [key]: state }))
  const save = (async () => {
    const done = landed.get(key)
    if (done && (await exists(project, done.path))) return done
    landed.delete(key)
    set({ state: 'saving' })
    try {
      const saved =
        kind === 'model'
          ? await send(`${base(project)}/models/save`, {
              id: result.id,
              query,
            })
          : await send(`${base(project)}/save`, {
              id: result.id,
              query,
              credited,
            })
      landed.set(key, saved)
      set({ state: 'saved', path: saved.path })
      return saved
    } catch (error) {
      set({
        state: 'failed',
        message: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  })().finally(() => pending.delete(key))
  pending.set(key, save)
  return save
}

/** Forgets every save, for a test to start clean. */
export function resetSaves(): void {
  pending.clear()
  landed.clear()
  saveStore.setState({}, true)
}
