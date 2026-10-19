import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { PROJECT_FILE } from '@/shared/board-files'
import type { ProjectChecks } from '@/shared/records/board'
import type { CheckResult, Finding } from '@/shared/records/check'

import { buildCascade } from './cascade'
import { checkFonts } from './fonts'
import {
  boardPath,
  type FrameTarget,
  readFrame,
  type Sheet,
} from './frame-source'
import { checkLinks } from './links'
import { checkMarkup, checkNaming } from './structure'
import { checkTheme } from './theme'
import { tokenSheets } from './tokens'
import { checkUppercase } from './uppercase'

/** What every frame in one project is checked against, read once per call. */
export interface ProjectContext {
  config: ProjectChecks
  tokens: Sheet[]
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
  { config, tokens }: ProjectContext,
): Finding[] {
  const source = readFrame(target)
  const cascade = buildCascade(source, tokens)
  return [
    ...checkNaming(target, boardPath(target.root, source.path)),
    ...checkMarkup(source),
    ...checkLinks(source),
    ...checkFonts(source, cascade, config),
    ...checkTheme(source),
    ...(config.noUppercase ? checkUppercase(source, cascade) : []),
  ]
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
  return {
    config: readConfig(root, project),
    tokens: tokenSheets(root, project, boardSheet),
  }
}

/**
 * The project's `checks` config, read by hand rather than through the
 * project record's schema, which the hook cannot afford to load. A file that
 * does not read, or a key of the wrong type, leaves that rule off.
 */
function readConfig(root: string, project: string): ProjectChecks {
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
  return config
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
