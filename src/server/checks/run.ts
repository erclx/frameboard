import { readdir } from 'node:fs/promises'
import { join } from 'node:path'

import { listFrames, listPageFolders } from '@/server/board/scan'
import type { CheckResult, Finding } from '@/shared/records/check'

import { DECLARATION_RULES } from './browser/declarations'
import { FONT_SIZE_RULES } from './browser/font-size'
import { LAYOUT_RULES } from './browser/layout'
import { CUSTOM_PROPERTY_RULES } from './custom-properties'
import { FONT_RULES } from './fonts'
import { checkFrameIn, type ProjectContext, readProjectContext } from './frame'
import { LINK_RULES } from './links'
import { OUTRANKED_RULES } from './outranked'
import type { RuleDoc } from './rule'
import { checkDotFolders, STRUCTURE_RULES } from './structure'
import { THEME_RULES } from './theme'
import { UPPERCASE_RULES } from './uppercase'

/** Every rule `check` runs, in the order `docs` lists them. */
export const RULES: RuleDoc[] = [
  ...STRUCTURE_RULES,
  ...LINK_RULES,
  ...FONT_RULES,
  ...THEME_RULES,
  ...CUSTOM_PROPERTY_RULES,
  ...UPPERCASE_RULES,
  ...OUTRANKED_RULES,
  ...LAYOUT_RULES,
  ...FONT_SIZE_RULES,
  ...DECLARATION_RULES,
]

/** Checks every frame on one page. */
export async function checkPage(
  root: string,
  project: string,
  page: string,
): Promise<CheckResult> {
  return checkPages(root, project, [page], readProjectContext(root, project))
}

/** Checks every frame in a project, and its folder names. */
export async function checkProject(
  root: string,
  project: string,
): Promise<CheckResult> {
  const projectDir = join(root, project)
  const [pages, entries] = await Promise.all([
    listPageFolders(projectDir),
    readdir(projectDir, { withFileTypes: true }),
  ])
  const result = await checkPages(
    root,
    project,
    pages,
    readProjectContext(root, project),
  )
  const folders = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
  return {
    checked: result.checked,
    findings: [
      ...checkDotFolders(root, projectDir, folders),
      ...result.findings,
    ],
  }
}

async function checkPages(
  root: string,
  project: string,
  pages: string[],
  context: ProjectContext,
): Promise<CheckResult> {
  const findings: Finding[] = []
  let checked = 0
  for (const page of pages) {
    for (const name of await listFrames(join(root, project, page))) {
      findings.push(...checkFrameIn({ root, project, page, name }, context))
      checked += 1
    }
  }
  return { checked, findings }
}
