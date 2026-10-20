import { navigate } from 'wouter/use-browser-location'

import { jumpTo } from '@/client/board/jump'
import { select, selectionStore } from '@/client/board/selection'
import { boardUrl } from '@/shared/board-urls'
import type { ListResult } from '@/shared/records/list'

/** One place the palette jumps to, by the ref the board names it with. */
export interface Target {
  ref: string
  label: string
  /** What the row shows on its right, such as the page a frame sits on. */
  hint?: string
}

export interface Targets {
  frames: Target[]
  pages: Target[]
  projects: Target[]
}

/**
 * Every project, and the pages and shown frames of `project`, the one the
 * route names. A hidden frame is left out, since `pruneSelection` would drop
 * it from the selection the jump sets and there would be nothing to zoom to.
 */
export function boardTargets(
  board: ListResult,
  project: string | null,
): Targets {
  const open = board.projects.find((candidate) => candidate.name === project)
  return {
    projects: board.projects.map(({ name }) => ({ ref: name, label: name })),
    pages: (open?.pages ?? []).map((page) => ({
      ref: page.ref,
      label: page.name,
    })),
    frames: (open?.pages ?? []).flatMap((page) =>
      page.frames
        .filter((frame) => !frame.hidden)
        .map((frame) => ({
          ref: frame.ref,
          label: frame.name,
          hint: page.name,
        })),
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
