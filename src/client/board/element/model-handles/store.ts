import { createStore } from 'zustand/vanilla'

import type { Axes } from '@/shared/frame-bridge/model'

import type { ElementKey } from '../../selection'
import { isEven } from '../model-staging'

/** What a drag along an axis does to the model. */
export type HandleMode = 'move' | 'turn' | 'size'

/** A model by its frame and file index, which hold through the hash each write moves. */
type ModelKey = Pick<ElementKey, 'frame' | 'index'>

const keyOf = ({ frame, index }: ModelKey) => `${frame}\n${index}`

/**
 * The gizmo's mode and each model's chosen link, this tab's own and never
 * the file's, since no attribute of the viewer carries either.
 */
export const handlesStore = createStore<{
  mode: HandleMode
  links: Readonly<Record<string, boolean>>
}>()(() => ({ mode: 'move', links: {} }))

export function setHandleMode(mode: HandleMode): void {
  handlesStore.setState({ mode })
}

/** Whether a model's axes size together: as chosen, else while they are even. */
export function isLinked(
  links: Readonly<Record<string, boolean>>,
  key: ModelKey,
  scale: Axes,
): boolean {
  return links[keyOf(key)] ?? isEven(scale)
}

export function setLinked(key: ModelKey, linked: boolean): void {
  handlesStore.setState(({ links }) => ({
    links: { ...links, [keyOf(key)]: linked },
  }))
}
