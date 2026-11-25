import { createStore } from 'zustand/vanilla'

import type { generateImage, ImageGenerate, SavedImage } from '../sourcing'

type Run =
  | { state: 'idle' }
  | { state: 'running' }
  | { state: 'failed'; message: string }

/** A generated image, which always carries the file it was saved as. */
export type GeneratedPicture = ImageGenerate & { saved: SavedImage }

/** One project's Generate: the prompt, the run, and this session's pictures. */
export interface GenerateSession {
  prompt: string
  run: Run
  /** Newest first. */
  pictures: readonly GeneratedPicture[]
  /** The picture the preview shows, by its path under `assets/`. */
  picked: string | null
}

export const EMPTY_SESSION: GenerateSession = {
  prompt: '',
  run: { state: 'idle' },
  pictures: [],
  picked: null,
}

/**
 * Generate by project, held here rather than in the view so a run that already
 * spent outlives the dialog closing. A board reload starts it empty.
 */
export const runStore = createStore<Record<string, GenerateSession>>()(
  () => ({}),
)

export function updateSession(
  project: string,
  change: Partial<GenerateSession>,
): void {
  runStore.setState((current) => ({
    ...current,
    [project]: { ...(current[project] ?? EMPTY_SESSION), ...change },
  }))
}

/** Runs the project's prompt once, sending nothing while a run of it is out. */
export async function startRun(
  project: string,
  generate: typeof generateImage,
): Promise<void> {
  const { prompt, run } = runStore.getState()[project] ?? EMPTY_SESSION
  if (run.state === 'running' || prompt.trim() === '') return
  updateSession(project, { run: { state: 'running' } })
  try {
    const { saved, ...record } = await generate(project, prompt.trim())
    const { pictures } = runStore.getState()[project] ?? EMPTY_SESSION
    updateSession(project, {
      run: { state: 'idle' },
      ...(saved && {
        pictures: [
          { ...record, saved },
          // A deleted file's name is free again, so its picture goes with it.
          ...pictures.filter(({ saved: { path } }) => path !== saved.path),
        ],
        picked: saved.path,
      }),
    })
  } catch (error) {
    updateSession(project, {
      run: {
        state: 'failed',
        message: error instanceof Error ? error.message : String(error),
      },
    })
  }
}

/** Forgets every session, for a test to start clean. */
export function resetRuns(): void {
  runStore.setState({}, true)
}
