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

import { keyLabel } from '@/client/actions/keys'
import {
  type Action,
  refreshActions,
  registerActions,
} from '@/client/actions/registry'
import { toast } from '@/client/components/ui/toast'
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

/** Where a frame's rename field opens, being its layers row, the inspector's name, or its canvas label. */
export type RenameSurface = 'layers' | 'inspector' | 'canvas'

/**
 * The frame shown as a rename field and the one surface showing it, so two
 * fields never open at once and steal each other's focus.
 */
const renamingStore = createStore<{
  ref: string | null
  surface: RenameSurface
}>()(() => ({ ref: null, surface: 'layers' }))

/** The ref `surface` shows as a rename field, null when it shows none. */
export function useRenamingFrame(surface: RenameSurface): string | null {
  return useStore(renamingStore, (state) =>
    state.surface === surface ? state.ref : null,
  )
}

export function startFrameRename(ref: string, surface: RenameSurface): void {
  renamingStore.setState({ ref, surface })
}

export function stopFrameRename(): void {
  renamingStore.setState({ ref: null })
}

/** The open rename field, for code reading it outside a render. */
export function renamingFrame(): {
  ref: string | null
  surface: RenameSurface
} {
  return renamingStore.getState()
}

/**
 * Renames a frame through the server. The `renamed` message the write sends
 * moves its selection, flip, and unseen mark in every tab, so none is
 * carried here.
 */
export async function renameFrame(
  frame: FrameRecord,
  name: string,
  calls: Structure = structure,
): Promise<void> {
  try {
    await calls.renameFrame(frame.ref, name)
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
  /** Nothing on the canvas shows a copy or a cut, so each toasts once the server holds it. */
  const hold =
    (verb: string, frames: readonly FrameRecord[]) =>
    (held: { held: number }) => {
      clipboard.setState(held)
      toast.add({
        title: `${verb} ${named(frames)}`,
        description: `Paste with ${keyLabel('$mod+KeyV')} on any page.`,
        type: 'success',
      })
    }

  return [
    {
      id: 'frame.rename',
      label: 'Rename frame',
      group: 'frame',
      keys: ['F2'],
      command: { label: 'Rename frame', icon: PencilLine },
      // The inspector shows one selected frame's name whenever the panels
      // show, unlike a layers row, which another tab can hide.
      enabled: () =>
        writable() && chosen().length === 1 && !mode.getState().hideUi,
      run: () => {
        const [frame] = chosen()
        if (!frame) return
        // The Frame tool's presets take the inspector's place, so leave it.
        mode.setState({ tool: 'move' })
        startFrameRename(frame.ref, 'inspector')
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
          .then(
            hold('Copied', frames),
            reportRefusal(`Couldn't copy ${named(frames)}`),
          )
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
          .then(
            hold('Cut', frames),
            reportRefusal(`Couldn't cut ${named(frames)}`),
          )
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
