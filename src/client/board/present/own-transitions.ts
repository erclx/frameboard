import { useEffect } from 'react'
import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'

import type { TransitionKeyframesList } from '@/shared/records/assets'

/** Reads a project's own transitions, null when the read is refused or fails. */
export type LoadTransitions = (
  project: string,
) => Promise<TransitionKeyframesList | null>

export const fetchOwnTransitions: LoadTransitions = async (project) => {
  try {
    const response = await fetch(
      `/api/projects/${encodeURIComponent(project)}/transitions`,
    )
    const body = (await response.json()) as
      | { ok: true; data: TransitionKeyframesList }
      | { ok: false }
    return body.ok ? body.data : null
  } catch {
    return null
  }
}

interface OwnState {
  /** The project whose keyframes are in, null while none are. */
  project: string | null
  names: readonly string[]
  css: string
}

const NONE: OwnState = { project: null, names: [], css: '' }

const ownStore = createStore<OwnState>()(() => NONE)

/**
 * Whether the keyframes of `project`'s own transition `name` are in, so a
 * step can play it. A step taken before they arrive cuts rather than naming
 * keyframes the document does not hold yet.
 */
export function canPlayOwn(project: string, name: string): boolean {
  const held = ownStore.getState()
  return held.project === project && held.names.includes(name)
}

/**
 * A project's own transition keyframes as one stylesheet, read when presenting
 * starts and when `names` changes, and never asked for a project holding none.
 */
export function useOwnKeyframes(
  project: string | undefined,
  names: string,
  load: LoadTransitions,
): string {
  useEffect(() => {
    if (project === undefined || names === '') {
      ownStore.setState(NONE)
      return
    }
    let stale = false
    void load(project).then((list) => {
      if (stale) return
      const transitions = list?.transitions ?? []
      ownStore.setState({
        project,
        names: transitions.map((transition) => transition.name),
        css: transitions.map((transition) => transition.css).join('\n'),
      })
    })
    return () => {
      stale = true
    }
  }, [project, names, load])
  useEffect(() => () => ownStore.setState(NONE), [])
  return useStore(ownStore, (held) =>
    held.project === project ? held.css : '',
  )
}
