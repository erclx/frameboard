import { navigate } from 'wouter/use-browser-location'

import { jumpTo } from '@/client/board/jump'
import { select, selectionStore } from '@/client/board/selection'
import { type LiveStore, liveStore } from '@/client/live/store'
import { type Structure, structure } from '@/client/live/structure'
import { boardUrl } from '@/shared/board-urls'
import type { ListResult } from '@/shared/records/list'

/** One place the palette jumps to, by the ref the board names it with. */
export interface Target {
  ref: string
  label: string
  /** What the row shows on its right, such as the project and page a frame sits on. */
  hint?: string
  /** A hidden frame, which the row marks and shows before it jumps. */
  hidden?: true
}

export interface Targets {
  frames: Target[]
  pages: Target[]
  projects: Target[]
}

/**
 * Every project, and with one open, every project's pages and frames, the
 * open project's first. Each page is hinted with its project and each frame
 * with `project / page`, since two projects can share a page name. A hidden
 * frame is listed and marked, since choosing it shows it first.
 */
export function boardTargets(
  board: ListResult,
  project: string | null,
): Targets {
  const projects = board.projects.map(({ name }) => ({
    ref: name,
    label: name,
  }))
  if (project === null) return { projects, pages: [], frames: [] }
  const ordered = [
    ...board.projects.filter((candidate) => candidate.name === project),
    ...board.projects.filter((candidate) => candidate.name !== project),
  ]
  return {
    projects,
    pages: ordered.flatMap((open) =>
      open.pages.map((page) => ({
        ref: page.ref,
        label: page.name,
        hint: open.name,
      })),
    ),
    frames: ordered.flatMap((open) =>
      open.pages.flatMap((page) =>
        page.frames.map((frame): Target => ({
          ref: frame.ref,
          label: frame.name,
          hint: `${open.name} / ${page.name}`,
          ...(frame.hidden ? { hidden: true } : {}),
        })),
      ),
    ),
  }
}

/** A project opens on its first page, which the board route redirects to. */
export function jumpToProject(name: string): void {
  navigate(`/p/${encodeURIComponent(name)}`)
}

export function jumpToPage(ref: string): void {
  const [project = '', page = ''] = ref.split('/')
  navigate(boardUrl(project, page))
}

/** Selects the frame on its page and zooms to it, through the board's jump. */
export function jumpToFrame(ref: string): void {
  const [project = '', page = ''] = ref.split('/')
  const pageRef = `${project}/${page}`
  jumpTo(pageRef, () => select(selectionStore, pageRef, [ref]))
}

/**
 * Shows a hidden frame, then jumps to it once the board the server sends
 * holds it shown. Jumping sooner would lose the selection, since
 * `pruneSelection` drops a frame the latest board still holds hidden.
 */
export async function showAndJumpToFrame(
  ref: string,
  store: LiveStore = liveStore,
  writes: Pick<Structure, 'flagFrames'> = structure,
): Promise<void> {
  await writes.flagFrames([ref], 'hidden', false)
  // A frame deleted before the board shows it leaves nothing to jump to.
  const shown = await new Promise<boolean>((resolve) => {
    const settle = () => {
      const state = frameState(store.getState().board, ref)
      if (state === 'hidden') return false
      resolve(state === 'shown')
      return true
    }
    if (settle()) return
    const stop = store.subscribe(() => {
      if (settle()) stop()
    })
  })
  if (shown) jumpToFrame(ref)
}

function frameState(
  board: ListResult | null,
  ref: string,
): 'shown' | 'hidden' | 'gone' {
  for (const project of board?.projects ?? []) {
    for (const page of project.pages) {
      const frame = page.frames.find((candidate) => candidate.ref === ref)
      if (frame) return frame.hidden ? 'hidden' : 'shown'
    }
  }
  return 'gone'
}
