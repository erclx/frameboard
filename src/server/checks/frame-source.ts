import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'

import type { Document, Element } from 'domhandler'
import { parse, type ParserError, type Token } from 'parse5'
import { adapter } from 'parse5-htmlparser2-tree-adapter'
import postcss, { CssSyntaxError, type Root } from 'postcss'

import { ASSETS_FOLDER, FRAME_EXTENSION } from '@/shared/board-files'
import type { FindingLocation } from '@/shared/records/check'

/** One frame on disk, named the way the board names it. */
export interface FrameTarget {
  root: string
  project: string
  page: string
  name: string
}

/** A stylesheet the frame renders with, and the file its offsets count in. */
export interface Sheet {
  css: string
  /** `token` sheets come from the board, `style` sits in the frame, `linked` beside it. */
  origin: 'token' | 'style' | 'linked'
  /** The file holding `css`, which a relative `url()` in it resolves against. */
  path: string
  /** Where `css` starts in that file, nonzero for a `<style>` block. */
  offset: number
}

/** A parse error the HTML tokenizer or tree builder raised, by its spec code. */
export interface ParseError {
  code: string
  location: FindingLocation
}

/**
 * A frame read once for every rule: its bytes, the tree css-select walks with
 * source locations, and the stylesheets it renders with in cascade order.
 */
export interface FrameSource extends FrameTarget {
  ref: string
  /** The `.html` file. */
  path: string
  pageDir: string
  projectDir: string
  html: string
  document: Document
  /** Every element in document order, outside any `<template>`. */
  elements: Element[]
  /**
   * The frame's own sheets in cascade order, being `<style>` blocks and local
   * `<link>`s in document order, each after the local sheets it imports.
   */
  sheets: Sheet[]
  /** Every parse error in source order, which a browser recovers from silently. */
  parseErrors: ParseError[]
}

export function readFrame(target: FrameTarget): FrameSource {
  const projectDir = join(target.root, target.project)
  const pageDir = join(projectDir, target.page)
  const path = join(pageDir, `${target.name}${FRAME_EXTENSION}`)
  const html = readFileSync(path, 'utf8')
  // As the edit writer's parseFrame does in src/server/edit/address.ts: a
  // browser drops a leading BOM before the tokenizer, where parse5 would read
  // it as text and imply the wrappers. A space is ignored alike and keeps
  // every offset.
  const parseErrors: ParseError[] = []
  const document = parse(html.replace(/^﻿/, ' '), {
    treeAdapter: adapter,
    sourceCodeLocationInfo: true,
    onParseError: (error: ParserError) => {
      parseErrors.push({
        code: error.code,
        location: {
          line: error.startLine,
          column: error.startCol,
          startOffset: error.startOffset,
          endOffset: error.endOffset,
        },
      })
    },
  }) as Document

  const elements: Element[] = []
  const sheets: Sheet[] = []
  const imported = new Set<string>()
  const walk = (node: Document | Element): void => {
    for (const child of node.children) {
      if (
        child.type !== 'tag' &&
        child.type !== 'style' &&
        child.type !== 'script'
      ) {
        continue
      }
      const element = child as Element
      elements.push(element)
      if (element.name === 'style') {
        const text = element.children
          .map((node) => ('data' in node ? node.data : ''))
          .join('')
        const start = element.children[0]?.startIndex
        sheets.push(
          ...withImports(
            { css: text, origin: 'style', path, offset: start ?? 0 },
            imported,
          ),
        )
      } else if (isStylesheetLink(element)) {
        const linked = localTarget(element.attribs.href ?? '', pageDir)
        if (linked && existsSync(linked)) {
          sheets.push(
            ...withImports(
              {
                css: readFileSync(linked, 'utf8'),
                origin: 'linked',
                path: linked,
                offset: 0,
              },
              imported,
            ),
          )
        }
      }
      // A template's content is a fragment the page never renders.
      if (element.name !== 'template') walk(element)
    }
  }
  walk(document)

  return {
    ...target,
    ref: `${target.project}/${target.page}/${target.name}`,
    path,
    pageDir,
    projectDir,
    html,
    document,
    elements,
    sheets,
    parseErrors,
  }
}

/**
 * A sheet behind the local sheets its `@import` rules load, each read once,
 * since an imported sheet cascades ahead of the rules that import it.
 */
function withImports(sheet: Sheet, imported: Set<string>): Sheet[] {
  let root
  try {
    root = postcss.parse(sheet.css)
  } catch {
    return [sheet]
  }
  const before: Sheet[] = []
  root.walkAtRules(/^import$/i, (rule) => {
    const url = importUrl(rule.params)
    const target = url === null ? null : localTarget(url, sheetBase(sheet))
    if (!target || imported.has(target) || !existsSync(target)) return
    imported.add(target)
    before.push(
      ...withImports(
        {
          css: readFileSync(target, 'utf8'),
          origin: 'linked',
          path: target,
          offset: 0,
        },
        imported,
      ),
    )
  })
  return [...before, sheet]
}

/** A sheet as far as it parses, and each break postcss refused in it. */
export interface ParsedSheet {
  root: Root
  /** In source order, every one a break a browser meets in the file. */
  errors: CssSyntaxError[]
}

/**
 * Parses `css` past every break postcss refuses, so a rule reads every
 * declaration a browser keeps. An unknown word, such as a declaration
 * missing its colon, is blanked out to its `;` or `}`, as a browser drops
 * that one declaration, with newlines kept so every offset holds. Any other
 * break, such as an unclosed block or string, cuts the sheet there, and the
 * cut's own leftovers are not breaks in the file, so none is recorded.
 */
export function parseSheet(css: string): ParsedSheet {
  let text = css
  const errors: CssSyntaxError[] = []
  let cut = false
  for (;;) {
    try {
      return { root: postcss.parse(text), errors }
    } catch (error) {
      if (!(error instanceof CssSyntaxError)) throw error
      if (!cut) errors.push(error)
      const at = offsetOf(text, error.line ?? 1, error.column ?? 1)
      const span = cut ? null : unknownWordSpan(text, at, error)
      if (span) {
        const [start, end] = span
        text = `${text.slice(0, start)}${text.slice(start, end).replace(/[^\n]/g, ' ')}${text.slice(end)}`
      } else {
        cut = true
        text = at < text.length ? text.slice(0, at) : ''
      }
    }
  }
}

/**
 * The declaration an unknown word sits in, from the `;` or `{` before it
 * through the `;` after it or up to a `}`, or null for any other break. The
 * span always holds the word, so each pass blanks at least one character.
 */
function unknownWordSpan(
  text: string,
  at: number,
  error: CssSyntaxError,
): [number, number] | null {
  if (!error.reason.startsWith('Unknown word')) return null
  const start =
    Math.max(text.lastIndexOf(';', at - 1), text.lastIndexOf('{', at - 1)) + 1
  const next = text.slice(at).search(/[;}]/)
  const end =
    next === -1 ? text.length : at + next + (text[at + next] === ';' ? 1 : 0)
  return end > at && /\S/.test(text[at] ?? '') ? [start, end] : null
}

/** The offset of a 1-based line and column in `text`. */
export function offsetOf(text: string, line: number, column: number): number {
  let offset = 0
  for (let at = 1; at < line; at++) {
    const next = text.indexOf('\n', offset)
    if (next === -1) return text.length
    offset = next + 1
  }
  return Math.min(offset + column - 1, text.length)
}

/** The URL an `@import` rule's parameters name, quoted or through `url()`. */
export function importUrl(params: string): string | null {
  const match = /^\s*(?:url\(\s*)?(['"]?)([^'")\s]+)\1/i.exec(params)
  return match?.[2] ?? null
}

export function isStylesheetLink(element: Element): boolean {
  return (
    element.name === 'link' &&
    /(^|\s)stylesheet(\s|$)/i.test(element.attribs.rel ?? '') &&
    element.attribs.href !== undefined
  )
}

/** A URL's file on disk when it names one relative to `base`, else null. */
export function localTarget(url: string, base: string): string | null {
  const trimmed = url.trim()
  if (
    trimmed === '' ||
    trimmed.startsWith('#') ||
    trimmed.startsWith('/') ||
    hasScheme(trimmed)
  ) {
    return null
  }
  const bare = trimmed.split(/[?#]/)[0] ?? ''
  let decoded = bare
  try {
    decoded = decodeURIComponent(bare)
  } catch {
    // A malformed escape names the file as written.
  }
  return resolve(base, decoded)
}

/** A scheme such as `https:` or `data:`, or a protocol-relative `//`. */
export function hasScheme(url: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('//')
}

/** The board-relative path of a file, with forward slashes on every platform. */
export function boardPath(root: string, path: string): string {
  return relative(root, path).split(sep).join('/')
}

/** Whether `path` sits inside `folder`, or is it. */
export function isInside(folder: string, path: string): boolean {
  const inside = relative(folder, path)
  return (
    inside === '' ||
    (!inside.startsWith(`..${sep}`) &&
      inside !== '..' &&
      !inside.startsWith(sep))
  )
}

export function assetsDirOf(source: Pick<FrameSource, 'projectDir'>): string {
  return join(source.projectDir, ASSETS_FOLDER)
}

/** Line and column of a span in `text`, both counted from 1. */
export function locate(
  text: string,
  startOffset: number,
  endOffset: number,
): FindingLocation {
  let line = 1
  let lineStart = 0
  for (let index = text.indexOf('\n'); index !== -1 && index < startOffset;) {
    line += 1
    lineStart = index + 1
    index = text.indexOf('\n', lineStart)
  }
  return { line, column: startOffset - lineStart + 1, startOffset, endOffset }
}

/** Where an element's start tag sits, or null for an element the parser implied. */
export function startTagLocation(element: Element): FindingLocation | null {
  const location = element.sourceCodeLocation?.startTag
  if (!location) return null
  return {
    line: location.startLine,
    column: location.startCol,
    startOffset: location.startOffset,
    endOffset: location.endOffset,
  }
}

/** Where one attribute sits, falling back to its element's start tag. */
export function attributeLocation(
  element: Element,
  name: string,
): FindingLocation | null {
  // The adapter stores parse5's own location, which names each attribute.
  const tag = element.sourceCodeLocation as Token.ElementLocation | undefined
  const location = tag?.attrs?.[name]
  if (!location) return startTagLocation(element)
  return {
    line: location.startLine,
    column: location.startCol,
    startOffset: location.startOffset,
    endOffset: location.endOffset,
  }
}

/** The folder a sheet's relative URLs resolve against. */
export function sheetBase(sheet: Sheet): string {
  return dirname(sheet.path)
}
