import { START_PAGE, START_PROJECT } from '@/shared/board-files'
import type { ListResult } from '@/shared/records/list'

/**
 * Whether the board is still the one `serve` started, being the start project
 * alone with its one start page and no frame, seen from a tab that may
 * write. The guide shows on that board and stores no flag of its own, since
 * any change a person or an agent makes ends it.
 */
export function isUntouched(
  board: ListResult | null,
  canWrite: boolean,
): boolean {
  if (!board || !canWrite) return false
  const [project, ...others] = board.projects
  if (!project || others.length > 0 || project.name !== START_PROJECT) {
    return false
  }
  const [page, ...more] = project.pages
  return (
    page !== undefined &&
    more.length === 0 &&
    page.name === START_PAGE &&
    page.frames.length === 0
  )
}
