import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

import postcss, {
  type AtRule,
  type ChildNode,
  CssSyntaxError,
  type Node,
} from 'postcss'

import { ASSETS_FOLDER } from '@/shared/board-files'
import {
  isOwnTransitionName,
  TRANSITION_FILE_EXTENSION,
  TRANSITION_ROLES,
  type TransitionRole,
  TRANSITIONS_FOLDER,
} from '@/shared/present-transition'
import type { Finding, FindingLocation } from '@/shared/records/check'

import { offsetOf } from './frame-source'
import { findingFor, type RuleDoc } from './rule'

export const TRANSITION_FILE_RULES: RuleDoc[] = [
  {
    id: 'transition-file',
    tier: 'exact',
    severity: 'error',
    description: `A stylesheet under ${ASSETS_FOLDER}/${TRANSITIONS_FOLDER}/ is named in lowercase kebab case and holds @keyframes enter, optionally @keyframes leave, and nothing else, with no url(), quoted string, or escape. The board refuses a file breaking it whole, whether or not the rule is on`,
  },
]

const finding = findingFor(TRANSITION_FILE_RULES)

/** One thing a transition sheet may not hold, at its place in the file when it has one. */
export interface TransitionProblem {
  message: string
  location: FindingLocation | null
}

/**
 * A transition sheet as the board takes it: the text inside each of its two
 * keyframes blocks, or every reason it is refused whole.
 */
export type TransitionReading =
  | { ok: true; enter: string; leave: string | null }
  | { ok: false; problems: TransitionProblem[] }

/** A keyframe step: `from`, `to`, or a percentage, alone or in a comma list. */
const STEP =
  /^(?:from|to|\d+(?:\.\d+)?%)(?:\s*,\s*(?:from|to|\d+(?:\.\d+)?%))*$/i

/**
 * Reads one transition sheet named `name`, its file's stem. The board plays
 * what this returns in its own document, so the sheet is refused whole on
 * any stray rather than read past it: a name the board does not take, a
 * break postcss refuses, anything at the top level but a comment and the
 * `enter` and `leave` keyframes, anything in a keyframes block but steps of
 * declarations, and a value that could load a file. A value loads one
 * through `url()`, through a quoted string such as `image-set()` takes, or
 * through an escape spelling either, so all three are refused.
 */
export function readTransitionSheet(
  name: string,
  css: string,
): TransitionReading {
  if (!isOwnTransitionName(name)) {
    return refused([
      {
        message: `${name} is no transition name. Name the file in lowercase kebab case, and not after a built-in transition, none, or page`,
        location: null,
      },
    ])
  }
  let nodes: ChildNode[]
  try {
    nodes = postcss.parse(css).nodes
  } catch (error) {
    if (!(error instanceof CssSyntaxError)) throw error
    const at = offsetOf(css, error.line ?? 1, error.column ?? 1)
    return refused([
      {
        message: `The stylesheet does not parse: ${error.reason}`,
        location: {
          line: error.line ?? 1,
          column: error.column ?? 1,
          startOffset: at,
          endOffset: at,
        },
      },
    ])
  }

  const problems: TransitionProblem[] = []
  const held = new Map<TransitionRole, AtRule>()
  for (const node of nodes) {
    if (node.type === 'comment') continue
    const role = roleOf(node)
    if (!role) {
      problems.push(problemAt(node, strayMessage(node)))
    } else if (held.has(role)) {
      problems.push(problemAt(node, `@keyframes ${role} is written twice`))
    } else {
      held.set(role, node as AtRule)
      problems.push(...blockProblems(node as AtRule, role))
    }
  }
  const enter = held.get('enter')
  if (!enter) {
    problems.push({ message: '@keyframes enter is missing', location: null })
  }
  if (!enter || problems.length > 0) return refused(problems)
  const leave = held.get('leave')
  return { ok: true, enter: bodyOf(enter), leave: leave ? bodyOf(leave) : null }
}

function refused(problems: TransitionProblem[]): TransitionReading {
  return { ok: false, problems }
}

/** The role a top-level node holds the keyframes of, null for anything else. */
function roleOf(node: ChildNode): TransitionRole | null {
  if (node.type !== 'atrule' || node.name !== 'keyframes') return null
  return TRANSITION_ROLES.find((role) => role === node.params.trim()) ?? null
}

function strayMessage(node: ChildNode): string {
  if (node.type === 'rule') {
    return `A style rule (${node.selector}) sits outside the keyframes`
  }
  if (node.type === 'decl') {
    return `A declaration (${node.prop}) sits outside the keyframes`
  }
  const named =
    node.type === 'atrule' && node.name === 'keyframes'
      ? `@keyframes ${node.params.trim()}`
      : `@${node.type === 'atrule' ? node.name : node.type}`
  return `${named} is not @keyframes enter or @keyframes leave`
}

function blockProblems(
  block: AtRule,
  role: TransitionRole,
): TransitionProblem[] {
  const problems: TransitionProblem[] = []
  for (const step of block.nodes ?? []) {
    if (step.type === 'comment') continue
    if (step.type === 'atrule') {
      problems.push(
        problemAt(step, `@${step.name} sits inside @keyframes ${role}`),
      )
      continue
    }
    if (step.type === 'decl') {
      problems.push(
        problemAt(
          step,
          `${step.prop} sits in @keyframes ${role} outside a step`,
        ),
      )
      continue
    }
    if (!STEP.test(step.selector.trim())) {
      problems.push(
        problemAt(
          step,
          `${step.selector} is not a keyframe step such as from, to, or 50%`,
        ),
      )
      continue
    }
    for (const child of step.nodes) {
      if (child.type === 'comment') continue
      if (child.type !== 'decl') {
        problems.push(
          problemAt(child, `Only declarations sit inside a keyframe step`),
        )
        continue
      }
      const loads = loadIn(`${child.prop}:${child.value}`)
      if (loads) problems.push(problemAt(child, `${child.prop} holds ${loads}`))
    }
  }
  return problems
}

/** What in a declaration could load a file, null when nothing could. */
function loadIn(declaration: string): string | null {
  if (declaration.includes('\\')) {
    return 'a backslash escape, which can spell url()'
  }
  if (/url\(/i.test(declaration)) {
    return 'url(), and a transition loads nothing'
  }
  if (/["']/.test(declaration)) {
    return 'a quoted string, and a transition loads nothing'
  }
  return null
}

function problemAt(node: Node, message: string): TransitionProblem {
  const { start, end } = node.source ?? {}
  if (!start) return { message, location: null }
  return {
    message,
    location: {
      line: start.line,
      column: start.column,
      startOffset: start.offset,
      endOffset: end ? end.offset : start.offset,
    },
  }
}

/** The steps inside a keyframes block, on one line, with its comments dropped. */
function bodyOf(block: AtRule): string {
  const steps = (block.nodes ?? []).filter((node) => node.type === 'rule')
  return steps
    .map((step) => {
      const declarations = step.nodes
        .filter((child) => child.type === 'decl')
        .map(
          (child) =>
            `${child.prop}: ${child.value}${child.important ? ' !important' : ''}`,
        )
      return `${step.selector.trim()} { ${declarations.join('; ')} }`
    })
    .join(' ')
}

/** Where a transition named `name` sits in its board, with forward slashes. */
export function transitionPath(project: string, name: string): string {
  return `${project}/${ASSETS_FOLDER}/${TRANSITIONS_FOLDER}/${name}${TRANSITION_FILE_EXTENSION}`
}

/**
 * `transition-file`, one finding per thing the sheet may not hold. The
 * caller filters it through `withoutOff`, which silences the finding and
 * leaves the file refused.
 */
export function checkTransitionSheet(
  { project, name }: { project: string; name: string },
  css: string,
): Finding[] {
  const reading = readTransitionSheet(name, css)
  if (reading.ok) return []
  return reading.problems.map(({ message, location }) =>
    finding('transition-file', {
      frame: null,
      path: transitionPath(project, name),
      message,
      location,
    }),
  )
}

/**
 * Every stylesheet directly under a project's `assets/transitions/` by
 * name, each named by its stem whether or not the board takes that name, so
 * a misnamed file is reported rather than skipped. A dot-named file, a
 * folder, a link, and a file of another type are no transition. A folder
 * that does not exist lists none.
 */
export async function transitionFiles(
  projectDir: string,
): Promise<{ name: string; path: string }[]> {
  const folder = join(projectDir, ASSETS_FOLDER, TRANSITIONS_FOLDER)
  let entries
  try {
    entries = await readdir(folder, { withFileTypes: true })
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT' || code === 'ENOTDIR') return []
    throw error
  }
  return entries
    .filter(
      (entry) =>
        entry.isFile() &&
        !entry.name.startsWith('.') &&
        entry.name.endsWith(TRANSITION_FILE_EXTENSION),
    )
    .map((entry) => ({
      name: entry.name.slice(0, -TRANSITION_FILE_EXTENSION.length),
      path: join(folder, entry.name),
    }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
}
