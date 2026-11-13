import { type Command, Option } from 'commander'

import { FrameboardError } from '@/shared/errors'
import {
  DIRECTED,
  type Direction,
  DIRECTIONS,
  takesDirection,
  type Transition,
  TRANSITION_MS,
  type TransitionName,
} from '@/shared/present-transition'

import { parseInteger } from '../program'

export interface TransitionFlags {
  ms?: number
  direction?: Direction
}

/** Adds `--ms` and `--direction`, which `page transition` and `frame transition` share. */
export function withTransitionFlags(command: Command): Command {
  return command
    .option(
      '--ms <n>',
      `the transition's length, ${TRANSITION_MS.min} to ${TRANSITION_MS.max}, defaulting to the page's or 500`,
      parseInteger(TRANSITION_MS.min),
    )
    .addOption(
      new Option(
        '--direction <direction>',
        `the way ${DIRECTED.join(' and ')} move the incoming slide, defaulting to left`,
      ).choices(DIRECTIONS),
    )
}

/**
 * The transition a verb stores, refusing `usage` before anything is written
 * on a duration past the ceiling or a direction on a transition taking none.
 */
export function transitionFrom(
  name: TransitionName,
  { ms, direction }: TransitionFlags,
): Transition {
  if (ms !== undefined && ms > TRANSITION_MS.max) {
    throw new FrameboardError(
      'usage',
      `--ms takes at most ${TRANSITION_MS.max}.`,
      { ms },
    )
  }
  if (direction !== undefined && !takesDirection(name)) {
    throw new FrameboardError(
      'usage',
      `${name} takes no direction. Only ${DIRECTED.join(' and ')} do.`,
      { transition: name, direction },
    )
  }
  return {
    name,
    ...(direction ? { direction } : {}),
    ...(ms === undefined ? {} : { ms }),
  }
}
