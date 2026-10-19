import {
  ClipboardPaste,
  Copy,
  CopyPlus,
  EyeOff,
  Lock,
  PencilLine,
  Scissors,
  Trash2,
} from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useStore } from 'zustand'
import { createStore, type StoreApi } from 'zustand/vanilla'

import {
  type Action,
  refreshActions,
  registerActions,
} from '@/client/actions/registry'
import { type LiveStore, liveStore } from '@/client/live/store'
import { type Structure, structure } from '@/client/live/structure'
import type { FrameRecord } from '@/shared/records/list'

import { reportRefusal } from '../left-panel/page-actions'
import { type ModeStore, modeStore } from '../mode'
import { select, type SelectionStore, selectionStore } from '../selection'

/** How many frames the server holds to paste, zero until a copy or cut and again once the socket drops. */
export type ClipboardStore = StoreApi<{ held: number }>

export function createClipboardStore(): ClipboardStore {
  return createStore<{ held: number }>()(() => ({ held: 0 }))
}

export const clipboardStore = createClipboardStore()

/** The frame whose name the layers list and the inspector show as a rename field, by ref. */
const renamingStore = createStore<{ ref: string | null }>()(() => ({
  ref: null,
}))

export function useRenamingFrame(): string | null {
  return useStore(renamingStore, (state) => state.ref)
}

export function startFrameRename(ref: string): void {
  renamingStore.setState({ ref })
}

export function stopFrameRename(): void {
  renamingStore.setState({ ref: null })
}

/**
 * Renames a frame through the server, carrying the selection over to the
 * new ref when the frame was selected, so the rename never drops it.
 */
export async function renameFrame(
  frame: FrameRecord,
  name: string,
  calls: Structure = structure,
  selection: SelectionStore = selectionStore,
): Promise<void> {
  // Read before the call, since the board the rename sends can prune the old ref first.
  const { page, frames } = selection.getState()
  try {
    const renamed = await calls.renameFrame(frame.ref, name)
    if (page !== null && frames.includes(frame.ref)) {
      select(
        selection,
        page,
        frames.map((ref) => (ref === frame.ref ? renamed.ref : ref)),
      )
    }
  } catch (error) {
    reportRefusal(`Couldn't rename ${frame.name}`)(error)
  }
}

export interface StructureContext {
  /** The page the canvas shows. */
  page: () => string
  /** Every frame on it, hidden ones included. */
  frames: () => readonly FrameRecord[]
  selection: SelectionStore
  mode: ModeStore
  live: LiveStore
  clipboard: ClipboardStore
  calls: Structure
}

/**
 * The frame structure actions: rename, duplicate, delete, hide, lock, copy,
 * cut, and paste. Each acts in Edit while the tab may write, on the frames
 * selected on this page, and none acts while an element is selected, since
 * the selection then holds the element's frame and Backspace would delete a
 * frame the developer sees as an element. Keys bind by code, as a Mac turns
 * Alt and Shift combinations into other characters.
 */
export function structureActions(context: StructureContext): Action[] {
  const { selection, mode, live, clipboard, calls } = context
  const writable = () =>
    mode.getState().mode === 'edit' &&
    live.getState().canWrite &&
    !selection.getState().element
  const chosen = () => {
    const { page, frames } = selection.getState()
    if (page !== context.page()) return []
    return context.frames().filter((frame) => frames.includes(frame.ref))
  }
  const refs = () => chosen().map((frame) => frame.ref)
  const some = () => writable() && chosen().length > 0
  const unlocked = () => some() && chosen().every((frame) => !frame.locked)
  const selectAll = (frames: readonly FrameRecord[]) =>
    select(
      selection,
      context.page(),
      frames.map((frame) => frame.ref),
    )
  const named = (frames: readonly FrameRecord[]) =>
    frames.length === 1 ? (frames[0]?.name ?? '') : `${frames.length} frames`
  const hold = (held: { held: number }) => clipboard.setState(held)

  return [
    {
      id: 'frame.rename',
      label: 'Rename frame',
      group: 'frame',
      command: { label: 'Rename frame', icon: PencilLine },
      enabled: () => writable() && chosen().length === 1,
      run: () => {
        const [frame] = chosen()
        if (frame) startFrameRename(frame.ref)
      },
    },
    {
      id: 'frame.duplicate',
      label: 'Duplicate',
      group: 'frame',
      command: { label: 'Duplicate frame', icon: CopyPlus },
      keys: ['$mod+KeyD'],
      enabled: some,
      run: () => {
        const frames = chosen()
        calls
          .duplicateFrames(refs())
          .then(selectAll, reportRefusal(`Couldn't duplicate ${named(frames)}`))
      },
    },
    {
      id: 'frame.delete',
      label: 'Delete',
      group: 'frame',
      command: { label: 'Delete frame', icon: Trash2 },
      keys: ['Backspace', 'Delete'],
      enabled: unlocked,
      run: () => {
        const frames = chosen()
        calls
          .deleteFrames(refs())
          .catch(reportRefusal(`Couldn't delete ${named(frames)}`))
      },
    },
    {
      id: 'frame.hide',
      label: 'Hide',
      group: 'frame',
      command: { label: 'Hide frame', icon: EyeOff },
      keys: ['$mod+Shift+KeyH'],
      enabled: some,
      run: () => {
        const frames = chosen()
        calls
          .flagFrames(refs(), 'hidden', true)
          .catch(reportRefusal(`Couldn't hide ${named(frames)}`))
      },
    },
    {
      id: 'frame.lock',
      label: 'Lock',
      group: 'frame',
      command: { label: 'Lock or unlock frame', icon: Lock },
      keys: ['$mod+Shift+KeyL'],
      enabled: some,
      checked: () => {
        const frames = chosen()
        return frames.length > 0 && frames.every((frame) => frame.locked)
      },
      run: () => {
        const frames = chosen()
        const on = !frames.every((frame) => frame.locked)
        calls
          .flagFrames(refs(), 'locked', on)
          .catch(
            reportRefusal(
              `Couldn't ${on ? 'lock' : 'unlock'} ${named(frames)}`,
            ),
          )
      },
    },
    {
      id: 'frame.copy',
      label: 'Copy',
      group: 'frame',
      command: { label: 'Copy frame', icon: Copy },
      keys: ['$mod+KeyC'],
      enabled: some,
      run: () => {
        const frames = chosen()
        calls
          .copyFrames(refs())
          .then(hold, reportRefusal(`Couldn't copy ${named(frames)}`))
      },
    },
    {
      id: 'frame.cut',
      label: 'Cut',
      group: 'frame',
      command: { label: 'Cut frame', icon: Scissors },
      keys: ['$mod+KeyX'],
      enabled: unlocked,
      run: () => {
        const frames = chosen()
        calls
          .cutFrames(refs())
          .then(hold, reportRefusal(`Couldn't cut ${named(frames)}`))
      },
    },
    {
      id: 'frame.paste',
      label: 'Paste',
      group: 'frame',
      command: { label: 'Paste frames', icon: ClipboardPaste },
      keys: ['$mod+KeyV'],
      enabled: () => writable() && clipboard.getState().held > 0,
      run: () => {
        calls
          .pasteFrames(context.page())
          .then(selectAll, reportRefusal("Couldn't paste"))
      },
    },
  ]
}

/**
 * Registers the frame structure actions for the page a canvas shows,
 * rereading them as the selection, the board, the mode, or the clipboard
 * change. A dropped socket empties the clipboard's count, since the server
 * that held the frames may have restarted, so paste never sends to nothing.
 */
export function useStructureActions(
  page: string,
  frames: readonly FrameRecord[],
): void {
  const pageRef = useRef(page)
  const framesRef = useRef(frames)
  useEffect(() => {
    pageRef.current = page
    framesRef.current = frames
  }, [page, frames])
  useEffect(() => {
    const unregister = registerActions(
      structureActions({
        page: () => pageRef.current,
        frames: () => framesRef.current,
        selection: selectionStore,
        mode: modeStore,
        live: liveStore,
        clipboard: clipboardStore,
        calls: structure,
      }),
    )
    const unsubscribe = [
      selectionStore.subscribe(refreshActions),
      modeStore.subscribe(refreshActions),
      clipboardStore.subscribe(refreshActions),
      liveStore.subscribe((state, previous) => {
        if (!state.connected && previous.connected) {
          clipboardStore.setState({ held: 0 })
        }
        refreshActions()
      }),
    ]
    return () => {
      for (const stop of unsubscribe) stop()
      unregister()
    }
  }, [])
}
