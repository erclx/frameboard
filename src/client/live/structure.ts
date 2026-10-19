import type { PageRecord } from '@/shared/records/list'

import { writeBoard } from './write'

/** What an undo or redo answers: the page to show, or null to stay, and the frames it touched. */
export interface StepAnswer {
  page: string | null
  frames: string[]
}

/**
 * The board's structure writes, one per route, each body mirroring the CLI
 * verb's flags. A page ref is `<project>/<page>`. `send` stands in for
 * `fetch`, as a test's server does.
 */
export function createStructure(send: typeof fetch = fetch) {
  const post = <T>(path: string, body: unknown) =>
    writeBoard<T>(path, body, 'POST', send)
  return {
    addPage: (ref: string, index?: number) =>
      post<PageRecord>('/api/page/add', { ref, index }),
    duplicatePage: (ref: string) =>
      post<PageRecord>('/api/page/duplicate', { ref }),
    renamePage: (ref: string, name: string) =>
      post<PageRecord>('/api/page/rename', { ref, name }),
    movePage: (ref: string, index: number) =>
      post<PageRecord>('/api/page/move', { ref, index }),
    deletePage: (ref: string) =>
      post<{ deleted: string }>('/api/page/delete', { ref }),
    undo: () => post<StepAnswer>('/api/undo', {}),
    redo: () => post<StepAnswer>('/api/redo', {}),
  }
}

export type Structure = ReturnType<typeof createStructure>

/** The calls the board makes, through the browser's `fetch`. */
export const structure = createStructure()
