import { type EditLabel, whenFree } from '@/client/board/claims/waiting'
import type { Device } from '@/shared/frame-device'
import type { FrameSize } from '@/shared/frame-sizes'
import type { Transition } from '@/shared/present-transition'
import type {
  FrameRecord,
  PageRecord,
  ProjectRecord,
  SectionRecord,
} from '@/shared/records/list'
import type { StarterLook, StarterSheetRecord } from '@/shared/starter-tokens'

import { writeBoard } from './write'

/** A layout flag the board sets by hand, never written into the frame. */
export type FrameFlag = 'hidden' | 'locked'

/** How a frame holds its height: at a size, at its content's, or at a screen the page scrolls past. */
export type HeightMode = 'fixed' | 'fit' | 'scroll'

/** What an undo or redo answers: the page to show, or null to stay, and the frames it touched. */
export interface StepAnswer {
  page: string | null
  frames: string[]
  /** Each hand-edited frame's content hash as the step left it, by ref. */
  hashes?: Record<string, string>
}

/**
 * The board's structure writes, one per route, each body mirroring the CLI
 * verb's flags. A project ref is its name, a page ref `<project>/<page>`, and a frame ref
 * `<project>/<page>/<frame>`. `send` stands in for
 * `fetch`, as a test's server does.
 *
 * A rename, delete, or cut of a page or frame another session holds waits
 * until the claim drops. A project rename or delete is refused instead,
 * since the home view has no frame to show a waiting card beside.
 */
export function createStructure(send: typeof fetch = fetch) {
  const post = <T>(path: string, body: unknown) =>
    writeBoard<T>(path, body, 'POST', send)
  const held = <T>(
    refs: readonly string[],
    label: EditLabel,
    path: string,
    body: unknown,
  ) => whenFree(refs, label, () => post<T>(path, body))
  return {
    addProject: (name?: string) =>
      post<ProjectRecord>('/api/project/add', { name }),
    renameProject: (ref: string, name: string) =>
      post<ProjectRecord>('/api/project/rename', { ref, name }),
    duplicateProject: (ref: string) =>
      post<ProjectRecord>('/api/project/duplicate', { ref }),
    deleteProject: (ref: string) =>
      post<{ deleted: string }>('/api/project/delete', { ref }),
    /** Files the projects in one folder, `null` taking them out of theirs. */
    groupProjects: (refs: readonly string[], group: string | null) =>
      post<ProjectRecord[]>('/api/project/group', { refs, group }),
    archiveProjects: (refs: readonly string[], archived: boolean) =>
      post<ProjectRecord[]>('/api/project/archive', { refs, archived }),
    /** Turns one check rule off for the project, or back on, in `checks.off` of its `project.json`. */
    setProjectRule: (project: string, rule: string, off: boolean) =>
      post<{ project: string; off: string[] }>('/api/project/rule', {
        project,
        rule,
        off,
      }),
    /** Writes a starter `tokens.css`, refused as `tokens-exist` where any sheet reaches the project. */
    projectTokens: (ref: string, look: StarterLook) =>
      post<StarterSheetRecord>('/api/project/tokens', { ref, ...look }),
    addPage: (ref: string, index?: number) =>
      post<PageRecord>('/api/page/add', { ref, index }),
    duplicatePage: (ref: string) =>
      post<PageRecord>('/api/page/duplicate', { ref }),
    renamePage: (ref: string, name: string) =>
      held<PageRecord>([ref], 'rename', '/api/page/rename', { ref, name }),
    movePage: (ref: string, index: number) =>
      post<PageRecord>('/api/page/move', { ref, index }),
    /** Sets the transition present mode draws between the page's slides in one undo step, null clearing it. */
    setPageTransition: (ref: string, transition: Transition | null) =>
      post<PageRecord>('/api/page/transition', { ref, transition }),
    deletePage: (ref: string) =>
      held<{ deleted: string }>([ref], 'delete', '/api/page/delete', { ref }),
    /**
     * Sends a width and height rather than a preset, since a preset hugs its
     * height and a hand-placed frame keeps its size. An `asset` path under the
     * project's `assets/` lands the file in the new frame in the same undo
     * step, an audio taking a width alone.
     */
    addFrame: (
      ref: string,
      size: FrameSize | Pick<FrameSize, 'width'>,
      x: number,
      y: number,
      asset?: string,
    ) => post<FrameRecord>('/api/frame/add', { ref, ...size, x, y, asset }),
    /** Copies beside each source, or `offset` away from it when given, as an Alt-drag drops them. */
    duplicateFrames: (
      refs: readonly string[],
      offset?: { x: number; y: number },
    ) => post<FrameRecord[]>('/api/frame/duplicate', { refs, offset }),
    renameFrame: (ref: string, name: string) =>
      held<FrameRecord>([ref], 'rename', '/api/frame/rename', { ref, name }),
    /**
     * Sets how each frame holds its height in one undo step, `expected`
     * holding each frame's box as the board drew it, by ref. `heights` gives a
     * `scroll` write the screen height each named frame takes.
     */
    setHeightMode: (
      refs: readonly string[],
      mode: HeightMode,
      expected: Readonly<Record<string, FrameRecord['box']>>,
      heights?: Readonly<Record<string, number>>,
    ) =>
      held<FrameRecord[]>(refs, 'resize', '/api/frame/height', {
        refs,
        mode,
        expected,
        heights,
      }),
    orderFrame: (ref: string, index: number) =>
      post<FrameRecord>('/api/frame/order', { ref, index }),
    /** Sets the device drawn around each frame in one undo step, null clearing it. */
    setDevice: (refs: readonly string[], device: Device | null) =>
      post<FrameRecord[]>('/api/frame/device', { refs, device }),
    /** Sets each frame's own transition in one undo step, null so it takes its page's. */
    setFrameTransition: (
      refs: readonly string[],
      transition: Transition | null,
    ) => post<FrameRecord[]>('/api/frame/transition', { refs, transition }),
    flagFrames: (refs: readonly string[], flag: FrameFlag, on: boolean) =>
      post<FrameRecord[]>('/api/frame/flag', { refs, flag, on }),
    deleteFrames: (refs: readonly string[]) =>
      held<string[]>(refs, 'delete', '/api/frame/delete', { refs }),
    copyFrames: (refs: readonly string[]) =>
      post<{ held: number }>('/api/clipboard/copy', { refs }),
    cutFrames: (refs: readonly string[]) =>
      held<{ held: number }>(refs, 'cut', '/api/clipboard/cut', { refs }),
    /** Pastes onto a page, with the group's top left at `at` when given and beside its source otherwise. */
    pasteFrames: (page: string, at?: { x: number; y: number }) =>
      post<FrameRecord[]>('/api/clipboard/paste', { ref: page, at }),
    /** A section groups the frames whose center its box holds, so it moves no frame and waits on no claim. */
    addSection: (page: string, box: SectionRecord['box'], name?: string) =>
      post<SectionRecord>('/api/section/add', { page, name, box }),
    renameSection: (page: string, section: string, name: string) =>
      post<SectionRecord>('/api/section/rename', { page, section, name }),
    deleteSection: (page: string, section: string) =>
      post<{ deleted: string }>('/api/section/delete', { page, section }),
    undo: () => post<StepAnswer>('/api/undo', {}),
    redo: () => post<StepAnswer>('/api/redo', {}),
  }
}

export type Structure = ReturnType<typeof createStructure>

/** The calls the board makes, through the browser's `fetch`. */
export const structure = createStructure()
