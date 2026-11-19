import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'

import { request, subscribe } from '../bridge/channel'
import { followPage } from '../bridge/shown'
import { liveIframe } from '../frame-dom'
import { writeElements } from '../inspector/element/write'
import { enteredStore } from './entered'

/** The entered frame's moved controls, which the Keep values bar reads. */
export const controlsStore = createStore<{ ref: string | null; moved: number }>(
  () => ({ ref: null, moved: 0 }),
)

export function useMovedControls(): { ref: string | null; moved: number } {
  return useStore(controlsStore)
}

/** The entered frame, its iframe once one shows it, and the `controls` subscription of the page it shows. */
interface Entered {
  ref: string
  iframe: HTMLIFrameElement | null
  controls: string | null
  stop: () => void
}

let active: Entered | null = null

function report(ref: string, moved: number): void {
  const state = controlsStore.getState()
  if (state.ref !== ref || state.moved !== moved) {
    controlsStore.setState({ ref, moved })
  }
}

/**
 * Binds each page the entered frame's iframe shows, finding the iframe as it
 * mounts or swaps. A restamp keeps the page, so a keep's own write never
 * closes the binding, whose close puts every value back.
 */
function bindEntered(held: Entered): () => void {
  let unfollow: (() => void) | null = null
  const sync = () => {
    const iframe = liveIframe(held.ref)
    if (iframe === held.iframe) return
    unfollow?.()
    unfollow = null
    held.iframe = iframe
    report(held.ref, 0)
    if (!iframe) return
    unfollow = followPage(iframe, () => {
      const bound = subscribe(iframe, 'controls', {}, (moved) =>
        report(held.ref, moved),
      )
      held.controls = bound.id
      report(held.ref, 0)
      return () => {
        if (held.controls === bound.id) held.controls = null
        bound.close()
      }
    })
  }
  sync()
  const swaps = new MutationObserver(sync)
  swaps.observe(document.body, { childList: true, subtree: true })
  return () => {
    swaps.disconnect()
    unfollow?.()
  }
}

function release(): void {
  if (!active) return
  active.stop()
  active = null
  controlsStore.setState({ ref: null, moved: 0 })
}

function enter(ref: string | null): void {
  if (active?.ref === ref) return
  release()
  if (ref === null) return
  const held: Entered = { ref, iframe: null, controls: null, stop: () => {} }
  active = held
  held.stop = bindEntered(held)
}

/**
 * Binds the entered frame's controls while Play runs, the frame putting every
 * unkept value back on leaving, so Edit never shows a value the file does not hold.
 */
export function followEnteredControls(): () => void {
  enter(enteredStore.getState().ref)
  const unsubscribe = enteredStore.subscribe((state) => enter(state.ref))
  return () => {
    unsubscribe()
    release()
  }
}

/** Puts the entered frame's moved controls back to the file's values. */
export function resetControls(): void {
  if (!active?.iframe || !active.controls) return
  void request(active.iframe, 'controls-act', {
    controls: active.controls,
    act: 'reset',
  })
}

/**
 * Writes the moved values as one edit and one undo step, against the hash
 * the frame read them at, a refusal keeping them moved so Keep values can
 * run again.
 */
export async function keepControls(page: string): Promise<boolean> {
  const held = active
  const iframe = held?.iframe
  const controls = held?.controls
  if (!held || !iframe || !controls) return false
  const read = await request(iframe, 'controls-edits', { controls })
  if (!read) return false
  const written = await writeElements(
    page,
    read.edits.map(({ index, change }) => ({
      key: { frame: held.ref, index, hash: read.hash },
      change,
    })),
    // The live page already shows every value, so it is kept rather than reloaded.
    { previewed: true },
  )
  if (written && active === held && held.controls === controls) {
    await request(iframe, 'controls-act', { controls, act: 'settle' })
  }
  return written
}
