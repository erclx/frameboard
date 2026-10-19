import type { PageRecord } from '@/shared/records/list'

import { writeBoard } from './write'

/** What an undo or redo answers: the page to show, or null to stay, and the frames it touched. */
export interface StepAnswer {
  page: string | null
  frames: string[]
}

/**
 * The board's structure writes, one per route, each body mirroring the CLI
 * verb's flags. A page ref is `<project>/<page>`.
 */
export const structure = {
  addPage: (ref: string, index?: number) =>
    writeBoard<PageRecord>('/api/page/add', { ref, index }),
  duplicatePage: (ref: string) =>
    writeBoard<PageRecord>('/api/page/duplicate', { ref }),
  renamePage: (ref: string, name: string) =>
    writeBoard<PageRecord>('/api/page/rename', { ref, name }),
  movePage: (ref: string, index: number) =>
    writeBoard<PageRecord>('/api/page/move', { ref, index }),
  deletePage: (ref: string) =>
    writeBoard<{ deleted: string }>('/api/page/delete', { ref }),
  undo: () => writeBoard<StepAnswer>('/api/undo', {}),
  redo: () => writeBoard<StepAnswer>('/api/redo', {}),
}
