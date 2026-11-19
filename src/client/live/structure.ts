import { type EditLabel, whenFree } from '@/client/board/claims/waiting'
import type { Island, Pose, Turn } from '@/shared/frame-device'
import type { FrameSize } from '@/shared/frame-sizes'
import type {
  KitInstallRecord,
  KitRemoveRecord,
  KitSaveRecord,
} from '@/shared/kits'
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
 * The board's structure writes, a held page or frame waiting on its claim,
 * while a project is refused, since home has no frame to show a waiting card.
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
    /** Adds a project, filed in `group` when one is given. */
    addProject: (name?: string, group?: string) =>
      post<ProjectRecord>('/api/project/add', { name, group }),
    renameProject: (ref: string, name: string) =>
      post<ProjectRecord>('/api/project/rename', { ref, name }),
    /** Sets the project's title and moves its folder to the name made from it, answering where it landed. */
    retitleProject: (ref: string, title: string) =>
      post<ProjectRecord>('/api/project/title', { ref, title }),
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
    /** Adds a kit to a project in one undo step, for its frames to name. */
    installKit: (project: string, kit: string) =>
      post<KitInstallRecord>('/api/kits/install', { project, kit }),
    /** Takes a kit out of a project and off every frame naming it, in one undo step. */
    removeKit: (project: string, kit: string) =>
      post<KitRemoveRecord>('/api/kits/remove', { project, kit }),
    /** Saves a project's look as the kit `name` on this board. */
    saveKit: (project: string, name: string) =>
      post<KitSaveRecord>('/api/kits/save', { project, name }),
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
    // Sends a size, never a preset, since a preset hugs and a hand-placed frame keeps its size.
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
    // One undo step, `expected` holding each box as the board drew it.
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
    /** Shows or hides the device each frame's width names, in one undo step. */
    setDevice: (refs: readonly string[], show: boolean) =>
      post<FrameRecord[]>('/api/frame/device', { refs, show }),
    /** Names the foldable on each frame, shown in the pose nearest its width, or hands the pick back to its width, in one undo step. */
    setFoldable: (refs: readonly string[], foldable: boolean) =>
      post<FrameRecord[]>('/api/frame/device', { refs, foldable }),
    /** Folds each foldable to a pose, which sets its box, in one undo step. */
    setPose: (refs: readonly string[], pose: Pose) =>
      post<FrameRecord[]>('/api/frame/device', { refs, pose }),
    /** Picks each phone's island width, in one undo step. */
    setIsland: (refs: readonly string[], island: Island) =>
      post<FrameRecord[]>('/api/frame/device', { refs, island }),
    /** Turns each phone, tablet, or foldable to `turn`, the target rather than the next, so a retried call lands once, in one undo step. */
    setTurn: (refs: readonly string[], turn: Turn) =>
      post<FrameRecord[]>('/api/frame/device', { refs, turn }),
    // One undo step, a list changed since its `expected` refusing `stale-layout`.
    setWidths: (
      refs: readonly string[],
      widths: readonly number[],
      expected: Readonly<Record<string, readonly number[]>>,
    ) => post<FrameRecord[]>('/api/frame/widths', { refs, widths, expected }),
    /** Sets each frame's own transition in one undo step, null so it takes its page's. */
    setFrameTransition: (
      refs: readonly string[],
      transition: Transition | null,
    ) => post<FrameRecord[]>('/api/frame/transition', { refs, transition }),
    /** Sets the project kit each frame draws with in one undo step, null so it draws with the project's sheets alone. */
    setFrameKit: (refs: readonly string[], kit: string | null) =>
      post<FrameRecord[]>('/api/frame/kit', { refs, kit }),
    /** Sets one frame's speaker note in one undo step, refused once it is no longer `expected`. */
    setSpeakerNotes: (ref: string, speakerNotes: string, expected: string) =>
      post<FrameRecord>('/api/frame/speaker-notes', {
        ref,
        speakerNotes,
        expected,
      }),
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
