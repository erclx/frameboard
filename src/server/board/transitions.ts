import { readFile } from 'node:fs/promises'

import {
  readTransitionSheet,
  transitionFiles,
} from '@/server/checks/transition-file'
import { FrameboardError } from '@/shared/errors'
import {
  ownKeyframesName,
  type Transition,
  transitionNameOf,
  TRANSITIONS,
} from '@/shared/present-transition'

/** One of a project's own transitions, holding the inside of each keyframes block. */
export interface OwnTransition {
  name: string
  enter: string
  /** Null for a transition whose leaving slide holds still. */
  leave: string | null
}

/**
 * The transitions a project holds under `assets/transitions/`, by name. A
 * file the reader refuses is left out whole, whatever `checks.off` says, so
 * the board never lists or plays one the rule would report.
 */
export async function listTransitions(
  projectDir: string,
): Promise<OwnTransition[]> {
  const files = await transitionFiles(projectDir)
  const read = await Promise.all(
    files.map(async ({ name, path }) => {
      const reading = readTransitionSheet(name, await readFile(path, 'utf8'))
      return reading.ok
        ? [{ name, enter: reading.enter, leave: reading.leave }]
        : []
    }),
  )
  return read.flat()
}

/** The names of the transitions a project holds, sorted by name. */
export async function listTransitionNames(
  projectDir: string,
): Promise<string[]> {
  return (await listTransitions(projectDir)).map(({ name }) => name)
}

/**
 * A transition's keyframes as the board's own document loads them, each
 * under the name `ownKeyframesName` gives it for `project`.
 */
export function ownKeyframes(
  project: string,
  { name, enter, leave }: OwnTransition,
): string {
  const blocks = [
    `@keyframes ${ownKeyframesName(project, name, 'enter')} { ${enter} }`,
  ]
  if (leave !== null) {
    blocks.push(
      `@keyframes ${ownKeyframesName(project, name, 'leave')} { ${leave} }`,
    )
  }
  return blocks.join('\n')
}

/**
 * Refuses `usage` on a transition naming neither a built-in nor one the
 * project holds, and on a direction given to one of the project's own,
 * before a setter writes. Null, which clears, always passes.
 */
export async function assertKnownTransition(
  projectDir: string,
  transition: Transition | null,
): Promise<void> {
  if (!transition || transitionNameOf(transition.name)) return
  const own = await listTransitionNames(projectDir)
  if (!own.includes(transition.name)) {
    throw new FrameboardError(
      'usage',
      `${transition.name} is neither a built-in transition nor one in the project's assets/transitions folder.`,
      { transition: transition.name, known: [...TRANSITIONS, ...own] },
    )
  }
  if (transition.direction !== undefined) {
    throw new FrameboardError(
      'usage',
      `${transition.name} is the project's own transition and takes no direction.`,
      { transition: transition.name, direction: transition.direction },
    )
  }
}
