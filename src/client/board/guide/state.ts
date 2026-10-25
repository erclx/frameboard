import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'

import { useLive } from '@/client/live/store'
import type { FrameSizePreset } from '@/shared/frame-sizes'
import type { PageRecord } from '@/shared/records/list'
import {
  DEFAULT_LOOK,
  type StarterAccent,
  type StarterFont,
} from '@/shared/starter-tokens'

import { isUntouched } from './untouched'

export type Drawer = 'agent' | 'self'

export interface GuideState {
  /** Idle until the first answer, open while it runs, and done for the tab once skipped or finished. */
  phase: 'idle' | 'open' | 'done'
  /** The project the guide answers for, which its rename moves. */
  project: string | null
  at: number
  /** Whether the look step runs, fixed at the first answer so the count holds once a sheet is written. */
  withLook: boolean | null
  name: string | null
  size: FrameSizePreset
  accent: StarterAccent
  font: StarterFont
  drawer: Drawer
  refusal: string | null
  busy: boolean
  /** Set by a step change, so focus moves to the new step once it paints, remount or not. */
  moved: boolean
}

const START: GuideState = {
  phase: 'idle',
  project: null,
  at: 0,
  withLook: null,
  name: null,
  size: 'phone',
  accent: DEFAULT_LOOK.accent,
  font: DEFAULT_LOOK.font,
  drawer: 'agent',
  refusal: null,
  busy: false,
  moved: false,
}

/**
 * The guide's progress, kept in the tab alone, so a reload of a board still
 * untouched shows it again from the start and nothing on disk records it.
 * It outlives the canvas, which a rename remounts under its new route.
 */
export const guideStore = createStore<GuideState>()(() => START)

export function resetGuide(): void {
  guideStore.setState(START, true)
}

/** Whether the guide stands in for the empty page note on `page`. */
export function useShowsGuide(page: PageRecord): boolean {
  const board = useLive((state) => state.board)
  const canWrite = useLive((state) => state.canWrite)
  const phase = useStore(guideStore, (state) => state.phase)
  const project = useStore(guideStore, (state) => state.project)
  if (!canWrite || page.frames.length > 0) return false
  if (phase === 'open') return page.project === project
  return phase === 'idle' && isUntouched(board, canWrite)
}

/**
 * A typed project name as the folder it renames to, lower case with each run
 * of characters a name may not hold turned into one dash, so `Acme mobile`
 * becomes `acme-mobile`. The server still checks what comes out.
 */
export function folderName(typed: string): string {
  return typed
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** The line a prompt for the agent carries, naming the size and the project. */
export function agentPrompt(size: FrameSizePreset, project: string): string {
  return `Draw a ${size} screen for ${project} on frameboard`
}
