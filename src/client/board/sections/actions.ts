import { PanelTop, PencilLine, Trash2 } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'

import {
  type Action,
  refreshActions,
  registerActions,
} from '@/client/actions/registry'
import { type LiveStore, liveStore } from '@/client/live/store'
import { type Structure, structure } from '@/client/live/structure'
import type { FrameRecord, SectionRecord } from '@/shared/records/list'

import { boundsOf, type Box } from '../geometry/box'
import { reportRefusal } from '../left-panel/page-actions'
import { type ModeStore, modeStore } from '../mode'
import {
  clear,
  type SelectionStore,
  selectionStore,
  selectSection,
} from '../selection'

/** How far, in board pixels, a wrapped section reaches past its frames, more on top for its name and theirs. */
export const WRAP_PAD = 40
const WRAP_PAD_TOP = 80

/** The box a click of the Section tool draws, in board pixels, as a Frame click places a preset. */
export const CLICKED_SECTION = { width: 800, height: 600 } as const

/** Whether the toolbar's box slot shows Frame or Section, being the one chosen last. */
export const boxToolStore = createStore<{ tool: 'frame' | 'section' }>()(
  () => ({ tool: 'frame' }),
)

export function useBoxTool(): 'frame' | 'section' {
  return useStore(boxToolStore, (state) => state.tool)
}

/** The section shown as a rename field in Layers, null when none is. */
const renamingStore = createStore<{ name: string | null }>()(() => ({
  name: null,
}))

export function useRenamingSection(): string | null {
  return useStore(renamingStore, (state) => state.name)
}

export function startSectionRename(name: string): void {
  renamingStore.setState({ name })
}

export function stopSectionRename(): void {
  renamingStore.setState({ name: null })
}

/** The box wrapping `frames`, padded past them, or null for none. */
export function wrapBox(frames: readonly FrameRecord[]): Box | null {
  const bounds = boundsOf(frames.map((frame) => frame.box))
  if (!bounds) return null
  return {
    x: Math.round(bounds.x - WRAP_PAD),
    y: Math.round(bounds.y - WRAP_PAD_TOP),
    width: Math.round(bounds.width + WRAP_PAD * 2),
    height: Math.round(bounds.height + WRAP_PAD + WRAP_PAD_TOP),
  }
}

export interface SectionContext {
  /** The page the canvas shows. */
  page: () => string
  /** Every frame on it, hidden ones included. */
  frames: () => readonly FrameRecord[]
  sections: () => readonly SectionRecord[]
  selection: SelectionStore
  mode: ModeStore
  live: LiveStore
  calls: Structure
}

/**
 * The section actions: wrap the selected frames, rename or delete the
 * selected section, and the Section tool. Each acts in Edit while the tab may
 * write. Rename and Delete share F2 and Backspace with the frame's, and the
 * selection holds either frames or a section, so one of each pair is enabled.
 */
export function sectionActions(context: SectionContext): Action[] {
  const { selection, mode, live, calls } = context
  const writable = () =>
    mode.getState().mode === 'edit' &&
    live.getState().canWrite &&
    !selection.getState().element
  const chosenFrames = () => {
    const { page, frames } = selection.getState()
    if (page !== context.page()) return []
    return context.frames().filter((frame) => frames.includes(frame.ref))
  }
  const chosenSection = () => {
    const { page, section } = selection.getState()
    if (page !== context.page() || section === undefined) return undefined
    return context.sections().find((held) => held.name === section)
  }
  const onSection = () => writable() && chosenSection() !== undefined

  return [
    {
      id: 'section.wrap',
      label: 'Wrap in section',
      group: 'frame',
      command: { label: 'Wrap frames in a section', icon: PanelTop },
      keys: ['$mod+Alt+KeyG'],
      enabled: () => writable() && chosenFrames().length > 0,
      run: () => {
        const box = wrapBox(chosenFrames())
        if (!box) return
        const page = context.page()
        calls
          .addSection(page, box)
          .then((added) => selectSection(selection, page, added.name))
          .catch(reportRefusal("Couldn't wrap in a section"))
      },
    },
    {
      id: 'section.rename',
      label: 'Rename section',
      group: 'section',
      command: { label: 'Rename section', icon: PencilLine },
      keys: ['F2'],
      enabled: onSection,
      run: () => {
        const section = chosenSection()
        if (section) startSectionRename(section.name)
      },
    },
    {
      id: 'section.delete',
      label: 'Delete section',
      group: 'section',
      command: { label: 'Delete section, keeping its frames', icon: Trash2 },
      keys: ['Backspace', 'Delete'],
      enabled: onSection,
      run: () => {
        const section = chosenSection()
        if (!section) return
        calls
          .deleteSection(context.page(), section.name)
          .then(() => clear(selection))
          .catch(reportRefusal(`Couldn't delete ${section.name}`))
      },
    },
    {
      id: 'tool.section',
      label: 'Section',
      group: 'tool',
      command: { label: 'Draw a section', icon: PanelTop },
      keys: ['Shift+KeyS'],
      enabled: () => live.getState().canWrite,
      // Picking a tool returns to Edit, since a tool only works there.
      run: () => {
        boxToolStore.setState({ tool: 'section' })
        mode.setState({ tool: 'section', mode: 'edit' })
      },
      checked: () =>
        mode.getState().mode === 'edit' && mode.getState().tool === 'section',
    },
  ]
}

/**
 * Adds a section at a drawn box, or at the clicked size with its top left on
 * the point, then selects it and returns to Move, as one click or drag of the
 * Section tool.
 */
export async function placeSection(
  page: string,
  box: { x: number; y: number; width?: number; height?: number },
  {
    calls = structure,
    selection = selectionStore,
    mode = modeStore,
  }: { calls?: Structure; selection?: SelectionStore; mode?: ModeStore } = {},
): Promise<SectionRecord | null> {
  try {
    const added = await calls.addSection(page, {
      x: Math.round(box.x),
      y: Math.round(box.y),
      width: Math.round(box.width ?? CLICKED_SECTION.width),
      height: Math.round(box.height ?? CLICKED_SECTION.height),
    })
    selectSection(selection, page, added.name)
    mode.setState({ tool: 'move' })
    return added
  } catch (error) {
    reportRefusal("Couldn't add a section")(error)
    return null
  }
}

/** Registers the section actions for the page the board shows, following its frames and sections. */
export function useSectionActions(
  page: string,
  frames: readonly FrameRecord[],
  sections: readonly SectionRecord[],
): void {
  const held = useRef({ page, frames, sections })
  useEffect(() => {
    held.current = { page, frames, sections }
  }, [page, frames, sections])
  useEffect(() => {
    const unregister = registerActions(
      sectionActions({
        page: () => held.current.page,
        frames: () => held.current.frames,
        sections: () => held.current.sections,
        selection: selectionStore,
        mode: modeStore,
        live: liveStore,
        calls: structure,
      }),
    )
    const unsubscribe = [
      selectionStore.subscribe(refreshActions),
      modeStore.subscribe(refreshActions),
      liveStore.subscribe((state, previous) => {
        refreshActions()
        if (state.canWrite === previous.canWrite) return
        if (!state.canWrite && modeStore.getState().tool === 'section') {
          modeStore.setState({ tool: 'move' })
        }
      }),
    ]
    return () => {
      for (const stop of unsubscribe) stop()
      unregister()
    }
  }, [])
}
