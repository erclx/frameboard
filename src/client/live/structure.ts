import type { FrameSizePreset } from '@/shared/frame-sizes'
import type { FrameRecord, PageRecord } from '@/shared/records/list'

import { writeBoard } from './write'

/** A layout flag the board sets by hand, never written into the frame. */
export type FrameFlag = 'hidden' | 'locked'

/** What an undo or redo answers: the page to show, or null to stay, and the frames it touched. */
export interface StepAnswer {
  page: string | null
  frames: string[]
  /** Each hand-edited frame's content hash as the step left it, by ref. */
  hashes?: Record<string, string>
}

/**
 * The board's structure writes, one per route, each body mirroring the CLI
 * verb's flags. A page ref is `<project>/<page>` and a frame ref
 * `<project>/<page>/<frame>`. `send` stands in for
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
    addFrame: (ref: string, size: FrameSizePreset, x: number, y: number) =>
      post<FrameRecord>('/api/frame/add', { ref, size, x, y }),
    duplicateFrames: (refs: readonly string[]) =>
      post<FrameRecord[]>('/api/frame/duplicate', { refs }),
    renameFrame: (ref: string, name: string) =>
      post<FrameRecord>('/api/frame/rename', { ref, name }),
    orderFrame: (ref: string, index: number) =>
      post<FrameRecord>('/api/frame/order', { ref, index }),
    flagFrames: (refs: readonly string[], flag: FrameFlag, on: boolean) =>
      post<FrameRecord[]>('/api/frame/flag', { refs, flag, on }),
    deleteFrames: (refs: readonly string[]) =>
      post<string[]>('/api/frame/delete', { refs }),
    copyFrames: (refs: readonly string[]) =>
      post<{ held: number }>('/api/clipboard/copy', { refs }),
    cutFrames: (refs: readonly string[]) =>
      post<{ held: number }>('/api/clipboard/cut', { refs }),
    pasteFrames: (page: string) =>
      post<FrameRecord[]>('/api/clipboard/paste', { ref: page }),
    undo: () => post<StepAnswer>('/api/undo', {}),
    redo: () => post<StepAnswer>('/api/redo', {}),
  }
}

export type Structure = ReturnType<typeof createStructure>

/** The calls the board makes, through the browser's `fetch`. */
export const structure = createStructure()
