import { Columns2, GitCompareArrows, X } from 'lucide-react'
import { useEffect } from 'react'
import { useStore } from 'zustand'
import { createStore, type StoreApi } from 'zustand/vanilla'

import {
  type Action,
  refreshActions,
  registerActions,
} from '@/client/actions/registry'
import { toast } from '@/client/components/ui/toast'
import { dropBase, type UnseenStore, unseenStore } from '@/client/live/unseen'
import { frameThemeUrl } from '@/shared/theme'

import { type ModeStore, modeStore } from '../mode'
import { type SelectionStore, selectionStore } from '../selection'

/** Flip shows the version before over the whole frame, split up to a divider. */
export type CompareMode = 'flip' | 'split'

export interface CompareState {
  /** The frame compared, null while none is. */
  ref: string | null
  mode: CompareMode
  /** The content hash of the version shown before, the frame's base when compare began. */
  hash: string | null
  /** Where split's divider sits, as a share of the frame's width from its left. */
  split: number
}

export type CompareStore = StoreApi<CompareState>

export function createCompareStore(): CompareStore {
  return createStore<CompareState>()(() => ({
    ref: null,
    mode: 'flip',
    hash: null,
    split: 0.5,
  }))
}

/** The one frame compared at a time, which the frame and its label read. */
export const compareStore = createCompareStore()

export function useCompare<T>(selector: (state: CompareState) => T): T {
  return useStore(compareStore, selector)
}

/** Whether the server still holds the version, which its log drops past the cap and a restart loses. */
export type VersionHeld = (ref: string, hash: string) => Promise<boolean>

const versionHeld: VersionHeld = async (ref, hash) => {
  try {
    const response = await fetch(frameThemeUrl(ref, 'light', undefined, hash), {
      cache: 'no-store',
    })
    return response.ok
  } catch {
    return false
  }
}

export interface CompareStores {
  compare: CompareStore
  unseen: UnseenStore
  held: VersionHeld
}

const STORES: CompareStores = {
  compare: compareStore,
  unseen: unseenStore,
  held: versionHeld,
}

/**
 * Compares a frame with its base in `mode`, or moves a compare already on it
 * to `mode`. It asks the server for the version first, so a version the
 * server dropped drops the frame's base and says so rather than showing a
 * 404 page in the frame.
 */
export async function startCompare(
  ref: string,
  mode: CompareMode,
  { compare, unseen, held }: CompareStores = STORES,
): Promise<void> {
  const hash = unseen.getState().base[ref]
  if (!hash) return
  const current = compare.getState()
  if (current.ref === ref && current.hash === hash) {
    compare.setState({ mode })
    return
  }
  if (!(await held(ref, hash))) {
    dropBase(unseen, ref)
    toast.add({
      title: 'The version before is gone',
      description:
        'The server keeps it until it restarts or 200 later changes land.',
      type: 'warning',
    })
    return
  }
  // A selection or a change landing while the server answered moved on.
  if (unseen.getState().base[ref] !== hash) return
  compare.setState({ ref, mode, hash, split: 0.5 })
}

export function endCompare(compare: CompareStore = compareStore): void {
  if (compare.getState().ref === null) return
  compare.setState({ ref: null, hash: null })
}

/** Moves split's divider to a screen x over the compared frame, clamped to its edges. */
export function splitAt(
  clientX: number,
  compare: CompareStore = compareStore,
): void {
  const { ref } = compare.getState()
  const frame =
    ref &&
    document.querySelector<HTMLElement>(`[data-frame="${CSS.escape(ref)}"]`)
  if (!frame) return
  const { left, width } = frame.getBoundingClientRect()
  if (width <= 0) return
  compare.setState({
    split: Math.min(1, Math.max(0, (clientX - left) / width)),
  })
}

export interface CompareContext extends CompareStores {
  selection: SelectionStore
  mode: ModeStore
}

const CONTEXT: CompareContext = {
  ...STORES,
  selection: selectionStore,
  mode: modeStore,
}

/**
 * Registers `frame.compare`, `frame.compare.split`, and `frame.compare.end`
 * on Esc while the board is mounted. The first two act on the one selected
 * frame while it has a base. Compare ends on any selection change, on Play,
 * on the Note tool, and once the frame's base moves on, so a pick or an
 * element selection never reads the old version's indices.
 */
export function useCompareActions(context: CompareContext = CONTEXT): void {
  useEffect(() => {
    const { compare, unseen, selection, mode } = context
    const editing = () => mode.getState().mode === 'edit'
    const target = () => {
      const { frames } = selection.getState()
      const [ref] = frames
      return frames.length === 1 && ref && unseen.getState().base[ref]
        ? ref
        : null
    }
    const comparing = (which: CompareMode) => () => {
      const state = compare.getState()
      return state.ref !== null && state.mode === which
    }
    const start = (which: CompareMode) => () => {
      const ref = target()
      if (ref) void startCompare(ref, which, context)
    }
    const actions: Action[] = [
      {
        id: 'frame.compare',
        label: 'Compare with before',
        group: 'frame',
        command: { label: 'Compare with before', icon: GitCompareArrows },
        enabled: () => editing() && target() !== null,
        checked: comparing('flip'),
        run: start('flip'),
      },
      {
        id: 'frame.compare.split',
        label: 'Split with before',
        group: 'frame',
        command: { label: 'Split with before', icon: Columns2 },
        enabled: () => editing() && target() !== null,
        checked: comparing('split'),
        run: start('split'),
      },
      {
        id: 'frame.compare.end',
        label: 'End compare',
        group: 'frame',
        keys: ['Escape'],
        command: { label: 'End compare', icon: X },
        enabled: () => compare.getState().ref !== null,
        run: () => endCompare(compare),
      },
    ]
    const unregister = registerActions(actions)
    const stops = [
      compare.subscribe(refreshActions),
      unseen.subscribe((state) => {
        const { ref, hash } = compare.getState()
        if (ref && state.base[ref] !== hash) endCompare(compare)
        refreshActions()
      }),
      selection.subscribe(() => endCompare(compare)),
      mode.subscribe((state) => {
        if (state.mode === 'play' || state.tool === 'note') endCompare(compare)
      }),
    ]
    return () => {
      for (const stop of stops) stop()
      unregister()
      endCompare(compare)
    }
  }, [context])
}
