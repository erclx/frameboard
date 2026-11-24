import { LOCKED_ATTRIBUTE } from '@/shared/element-marks'

import {
  type ElementEdit,
  type WriteDeps,
  writeElements,
} from '../inspector/element/write'
import type { ElementKey } from '../selection'

/** What an element's Layers row turns on and off, each kept in its frame's file. */
export type ElementFlag = 'hidden' | 'locked'

/** Turns a flag on or off for elements of one frame, as one write and one undo step. */
export function flagElements(
  page: string,
  keys: readonly ElementKey[],
  flag: ElementFlag,
  on: boolean,
  deps: WriteDeps = {},
): Promise<boolean> {
  return writeElements(
    page,
    keys.map((key) => ({ key, change: changeOf(flag, on) })),
    deps,
  )
}

function changeOf(flag: ElementFlag, on: boolean): ElementEdit['change'] {
  if (flag === 'hidden') return { kind: 'hidden', value: on }
  return on
    ? { kind: 'attribute', name: LOCKED_ATTRIBUTE, value: '' }
    : { kind: 'attribute', name: LOCKED_ATTRIBUTE, remove: true }
}
