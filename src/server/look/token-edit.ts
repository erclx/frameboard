import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'

import postcss, {
  type ChildNode,
  type Declaration,
  type Node,
  type Root,
  type Rule,
} from 'postcss'

import { isCode } from '@/server/board/json-record'
import { contentHash } from '@/server/edit/address'
import { FrameboardError } from '@/shared/errors'

import { type Side, sideOf } from './token-table'

/** One token's declarations in one sheet, by the side each rule reads as. */
export type TokenSides = Partial<Record<Side, string>>

/**
 * What a hand edit asks of one token: a value on one theme or on both, or
 * a reset that takes every project declaration of it out.
 */
export type TokenEdit =
  | { name: string; side: 'light' | 'dark' | 'both'; value: string }
  | { name: string; reset: true }

const NAME = /^--[\w-]+$/
// A value carrying any of these could close the declaration or the rule.
const UNSAFE_VALUE = /[;{}\n\r]|\/\*/

/**
 * The project sheet with `edit` applied, every byte outside the token's
 * declarations left as it stood. `board` is the token's declarations in the
 * board sheet. A one-theme edit keeps the other theme rendering as it did,
 * pinning its old value under that theme's rule when the new declaration
 * would reach it, since a project `:root` ties a board dark rule on
 * specificity and wins by coming later. Refuses `invalid-edit` for a name or
 * value that is not one declaration, a reset of a token the board does not
 * set, and a sheet that does not parse.
 */
export function editTokenCss(
  css: string,
  board: TokenSides,
  edit: TokenEdit,
): string {
  if (!NAME.test(edit.name)) refuse(`${edit.name} is not a custom property.`)
  const root = parseSheet(css)
  const own = sidesIn(root, edit.name)
  if ('reset' in edit) {
    if (Object.keys(board).length === 0 || Object.keys(own).length === 0) {
      refuse(
        `${edit.name} has no board value under the project's, so there is nothing to reset to.`,
      )
    }
    return writeSides(root, edit.name, {})
  }
  const value = edit.value.trim()
  if (value === '' || UNSAFE_VALUE.test(edit.value)) {
    refuse(`${JSON.stringify(edit.value)} is not one declaration value.`)
  }

  const next: TokenSides = { ...own }
  if (edit.side === 'dark') {
    next.dark = value
  } else if (edit.side === 'light') {
    if (next.light !== undefined) next.light = value
    else next.base = value
    const darkWas = shown(board, own).dark
    if (shown(board, next).dark !== darkWas && darkWas !== undefined) {
      next.dark = darkWas
    }
  } else {
    next.base = value
    if (next.light !== undefined) next.light = value
    if (next.dark !== undefined) next.dark = value
  }
  const written = writeSides(root, edit.name, next)
  // An unclosed quote or bracket passes the character guard and breaks the
  // whole sheet, so the sheet is read back before anything is written.
  let readBack: TokenSides | undefined
  try {
    readBack = sidesIn(postcss.parse(written), edit.name)
  } catch {
    readBack = undefined
  }
  if (!isDeepStrictEqual(readBack, next)) {
    refuse(`${JSON.stringify(edit.value)} would leave the sheet unreadable.`)
  }
  return written
}

/**
 * The sheet with the token's declarations made exactly `sides`, as undo
 * restores them. A side present replaces the last declaration on that side,
 * or is added to that side's rule, and a side absent takes out every
 * declaration on it, dropping a rule it leaves empty.
 */
export function setTokenSides(
  css: string,
  name: string,
  sides: TokenSides,
): string {
  return writeSides(parseSheet(css), name, sides)
}

/** The token's declarations in a sheet, the last on each side winning, as the table reads them. */
export function tokenSides(css: string, name: string): TokenSides {
  return sidesIn(parseSheet(css), name)
}

export type SheetWrite = 'written' | 'created' | 'stale'

/**
 * Writes the project sheet at `path` through a temporary file and a rename,
 * reading the sheet again just before the rename and leaving it as it is
 * when its hash is no longer `hash`. A null `hash` means the sheet did not
 * exist, so it is created only while none does. Takes no lock, since an
 * agent's raw write never takes one.
 */
export function writeTokenSheet(
  path: string,
  hash: string | null,
  css: string,
): SheetWrite {
  if (hash === null) {
    try {
      writeFileSync(path, css, { flag: 'wx' })
      return 'created'
    } catch (error) {
      if (isCode(error, 'EEXIST')) return 'stale'
      throw error
    }
  }
  // A leading dot keeps the watcher from reading the temp file as the sheet.
  const temp = join(dirname(path), `.${basename(path)}.${process.pid}.tmp`)
  writeFileSync(temp, css)
  if (hashOrNull(path) !== hash) {
    rmSync(temp, { force: true })
    return 'stale'
  }
  renameSync(temp, path)
  return 'written'
}

/** A sheet's content hash, or null when it does not exist. */
export function hashOrNull(path: string): string | null {
  try {
    return contentHash(readFileSync(path))
  } catch (error) {
    if (isCode(error, 'ENOENT')) return null
    throw error
  }
}

/** The light and dark values a token renders with, the project's sides over the board's. */
function shown(board: TokenSides, project: TokenSides) {
  return {
    light: project.light ?? project.base ?? board.light ?? board.base,
    dark: project.dark ?? project.base ?? board.dark ?? board.base,
  }
}

function parseSheet(css: string): Root {
  try {
    return postcss.parse(css)
  } catch (error) {
    const reason =
      error instanceof postcss.CssSyntaxError ? error.reason : String(error)
    return refuse(`The token sheet does not parse: ${reason}.`)
  }
}

/** Every declaration of `name` in a rule the table reads, by side, in sheet order. */
function declsIn(root: Root, name: string): Record<Side, Declaration[]> {
  const found: Record<Side, Declaration[]> = { base: [], light: [], dark: [] }
  root.walkRules((rule) => {
    const side = sideOf(rule)
    if (!side) return
    rule.each((node) => {
      if (node.type === 'decl' && node.prop === name) found[side].push(node)
    })
  })
  return found
}

function sidesIn(root: Root, name: string): TokenSides {
  const sides: TokenSides = {}
  for (const [side, decls] of Object.entries(declsIn(root, name))) {
    const last = decls.at(-1)
    if (last) sides[side as Side] = last.value.trim()
  }
  return sides
}

function writeSides(root: Root, name: string, sides: TokenSides): string {
  const found = declsIn(root, name)
  // Dark first, so a light or `:root` declaration added after it can be
  // placed ahead of every dark declaration the sheet then holds.
  for (const side of ['dark', 'base', 'light'] as const) {
    const value = sides[side]
    const decls = found[side]
    const last = decls.at(-1)
    if (value === undefined) {
      for (const decl of decls) {
        const rule = decl.parent
        decl.remove()
        if (rule && rule.nodes?.length === 0) rule.remove()
      }
    } else if (last) {
      if (last.value.trim() !== value) last.value = value
    } else {
      const before =
        side === 'dark'
          ? undefined
          : firstTopLevel(root, declsIn(root, name).dark)
      ruleFor(root, side, before).append(
        postcss.decl({ prop: name, value, raws: declRaws(root) }),
      )
    }
  }
  return root.toString()
}

/** The earliest top-level node holding any of `decls`, undefined for none. */
function firstTopLevel(
  root: Root,
  decls: Declaration[],
): ChildNode | undefined {
  let first: ChildNode | undefined
  for (const decl of decls) {
    let node: Node = decl
    while (node.parent && node.parent !== root) node = node.parent
    const top = node as ChildNode
    if (!first || root.index(top) < root.index(first)) first = top
  }
  return first
}

/** The spacing of the sheet's first declaration, so an added one reads like its neighbors. */
function declRaws(root: Root): Declaration['raws'] {
  let sample: Declaration | undefined
  root.walkDecls((decl) => {
    sample = decl
    return false
  })
  return {
    before: sample?.raws.before ?? '\n  ',
    between: sample?.raws.between ?? ': ',
  }
}

const NEW_SELECTOR: Record<Side, string> = {
  base: ':root',
  light: "[data-theme='light']",
  dark: "[data-theme='dark']",
}

/**
 * The top-level rule a new declaration on `side` goes into: the last such
 * rule outside any at-rule, else a new one. A new `:root` or light rule goes
 * ahead of every other rule, so a dark rule that ties it on specificity
 * still comes later and wins in dark, and a new dark rule goes last. With
 * `before`, the token's first dark declaration, a rule must come ahead of
 * it, and a new one goes just before it when none does.
 */
function ruleFor(root: Root, side: Side, before?: ChildNode): Rule {
  const held = root.nodes.filter(
    (node): node is Rule =>
      node.type === 'rule' &&
      sideOf(node) === side &&
      (!before || root.index(node) < root.index(before)),
  )
  const last = held.at(-1)
  if (last) return last
  const rule = postcss.rule({
    selector: NEW_SELECTOR[side],
    raws: { between: ' ', semicolon: true, after: '\n' },
  })
  const first = before ?? root.nodes.find((node) => node.type === 'rule')
  if (side !== 'dark' && first) {
    // Read first, since postcss rewrites the spacing of a node prepended to.
    const spacing = first.raws.before ?? ''
    root.insertBefore(first, rule)
    rule.raws.before = spacing
    first.raws.before = '\n\n'
  } else {
    rule.raws.before = root.nodes.length > 0 ? '\n\n' : ''
    root.append(rule)
    if (!root.raws.after?.includes('\n')) root.raws.after = '\n'
  }
  return rule
}

function refuse(message: string): never {
  throw new FrameboardError('invalid-edit', message)
}
