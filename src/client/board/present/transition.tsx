import { type ReactNode, useEffect, useLayoutEffect, useState } from 'react'

import { useLive } from '@/client/live/store'

import { holdKeyframes, type LayerRole, layerStyle } from './keyframes'
import { fetchOwnTransitions, type LoadTransitions } from './own-transitions'
import type { Travel } from './travel'

/**
 * The keyframes every layer plays. `own` holds those of the presented
 * project's own transitions, which the server read out of its files and
 * renamed, so nothing else a file held is here.
 */
export function TransitionKeyframes({ own }: { own: string }) {
  useLayoutEffect(() => holdKeyframes(), [])
  return own === '' ? null : <style data-own-transitions>{own}</style>
}

const NO_OWN: readonly string[] = []

/**
 * A project's own transition keyframes for Edit, read whenever its list of
 * names changes and never asked for a project holding none. It keeps its
 * own copy rather than the overlay's store, which leaving present clears.
 */
function useEditOwnKeyframes(
  project: string | undefined,
  load: LoadTransitions,
): string {
  const names = useLive(
    (state) =>
      state.board?.projects.find((candidate) => candidate.name === project)
        ?.transitions ?? NO_OWN,
  ).join(',')
  const key = `${project ?? ''}\n${names}`
  const [read, setRead] = useState<{ key: string; css: string } | null>(null)
  useEffect(() => {
    if (project === undefined || names === '') return
    let stale = false
    void load(project).then((list) => {
      if (stale) return
      setRead({
        key,
        css: (list?.transitions ?? []).map((held) => held.css).join('\n'),
      })
    })
    return () => {
      stale = true
    }
  }, [project, names, key, load])
  return read?.key === key ? read.css : ''
}

/**
 * The keyframes the inspector's tiles and a preview on the canvas play,
 * being the built-ins and `project`'s own, the ones presenting plays.
 */
export function EditKeyframes({
  project,
  load = fetchOwnTransitions,
}: {
  project: string | undefined
  load?: LoadTransitions
}) {
  return <TransitionKeyframes own={useEditOwnKeyframes(project, load)} />
}

/**
 * One slide playing its side of a transition, a leaving layer taking no
 * pointer, so a press mid-transition lands on the slide arriving.
 */
export function TransitionLayer({
  role,
  travel,
  project,
  children,
}: {
  role: LayerRole
  travel: Travel
  /** The presented page's project, which names its own transitions' keyframes. */
  project: string
  children: ReactNode
}) {
  const playing = travel.transition.name !== 'none'
  return (
    <div
      data-present-layer={role}
      data-transition={playing ? travel.transition.name : undefined}
      inert={role === 'leave' || undefined}
      className="absolute inset-0 overflow-hidden data-[present-layer=leave]:pointer-events-none data-[present-layer=leave]:-z-10"
      style={playing ? layerStyle(role, travel, project) : undefined}
    >
      {children}
    </div>
  )
}
