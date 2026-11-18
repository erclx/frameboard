import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { PROJECT_FILE } from '@/shared/board-files'
import type { ProjectChecks } from '@/shared/records/board'
import type { CheckResult, Finding } from '@/shared/records/check'

import { checkBindings } from './bindings'
import { checkBoardRoutes } from './board-routes'
import { buildCascade } from './cascade'
import { checkUnknownTokens } from './custom-properties'
import { checkFonts } from './fonts'
import {
  boardPath,
  type FrameTarget,
  readFrame,
  type Sheet,
} from './frame-source'
import { checkLinks } from './links'
import { withoutOff } from './rule'
import {
  checkMalformedTags,
  checkMarkup,
  checkNaming,
  checkNesting,
} from './structure'
import { checkTheme } from './theme'
import { frameKit, tokenSheets } from './tokens'
import { checkUppercase } from './uppercase'

/** What every frame in one project is checked against, read once per call. */
export interface ProjectContext {
  config: ProjectChecks
  /** The sheets a frame naming `kit` renders with, read once for each kit. */
  tokens: (kit: string | null) => Sheet[]
}

/**
 * Checks one frame against every rule. It sits apart from the page and
 * project runner so the write hook reaches it without the board scanner,
 * whose schema library would double the hook's start.
 */
export function checkFrame(target: FrameTarget): CheckResult {
  const context = readProjectContext(target.root, target.project)
  return { checked: 1, findings: checkFrameIn(target, context) }
}

export function checkFrameIn(
  target: FrameTarget,
  { config, tokens: tokensFor }: ProjectContext,
): Finding[] {
  const source = readFrame(target)
  const tokens = tokensFor(frameKit(target))
  const cascade = buildCascade(source, tokens)
  return withoutOff(
    [
      ...checkNaming(target, boardPath(target.root, source.path)),
      ...checkMarkup(source),
      ...checkMalformedTags(source),
      ...checkNesting(source),
      ...checkLinks(source),
      ...checkBoardRoutes(source),
      ...checkBindings(source),
      ...checkFonts(source, cascade, config),
      ...checkTheme(source),
      ...checkUnknownTokens(source, tokens),
      ...(config.noUppercase ? checkUppercase(source, cascade) : []),
    ],
    config.off,
  )
}

/**
 * The project's config and token sheets, read once for every frame a call
 * checks. `boardSheet` is a running server's own `--tokens` sheet, which the
 * address file names to every other caller.
 */
export function readProjectContext(
  root: string,
  project: string,
  boardSheet?: string | null,
): ProjectContext {
  const byKit = new Map<string | null, Sheet[]>()
  return {
    config: readConfig(root, project),
    tokens: (kit) => {
      const held = byKit.get(kit)
      if (held) return held
      const sheets = tokenSheets(root, project, boardSheet, kit)
      byKit.set(kit, sheets)
      return sheets
    },
  }
}

/**
 * The project's `checks` config, read by hand since the hook cannot afford the
 * schema, a bad key leaving its rule off.
 */
export function readConfig(root: string, project: string): ProjectChecks {
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(join(root, project, PROJECT_FILE), 'utf8'))
  } catch {
    return {}
  }
  const checks = isRecord(parsed) ? parsed.checks : undefined
  if (!isRecord(checks)) return {}
  const config: ProjectChecks = {}
  if (
    Array.isArray(checks.allowedFonts) &&
    checks.allowedFonts.every((font) => typeof font === 'string')
  ) {
    config.allowedFonts = checks.allowedFonts
  }
  if (typeof checks.noUppercase === 'boolean') {
    config.noUppercase = checks.noUppercase
  }
  if (typeof checks.minFontSize === 'number' && checks.minFontSize > 0) {
    config.minFontSize = checks.minFontSize
  }
  if (typeof checks.minContrast === 'number' && checks.minContrast >= 1) {
    config.minContrast = checks.minContrast
  }
  if (
    Array.isArray(checks.off) &&
    checks.off.every((rule) => typeof rule === 'string')
  ) {
    config.off = checks.off
  }
  return config
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
