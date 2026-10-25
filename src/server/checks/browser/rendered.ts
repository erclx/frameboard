import type { Browser } from 'playwright-core'

import { openFrame } from '@/server/capture/render'
import type { ProjectChecks } from '@/shared/records/board'
import type { Finding } from '@/shared/records/check'
import { type Theme, THEMES } from '@/shared/theme'

import { readFrame } from '../frame-source'
import { checkDeclarations, DECLARATION_RULES } from './declarations'
import { checkFontSize, FONT_SIZE_RULES } from './font-size'
import { checkLayout, LAYOUT_RULES, type RenderedTarget } from './layout'

/** Every browser rule, in the order `docs` lists them. */
export const BROWSER_RULES = [
  ...LAYOUT_RULES,
  ...FONT_SIZE_RULES,
  ...DECLARATION_RULES,
]

/** The rules that read one theme's page and land one finding at most. */
const THEMED_RULES = [...LAYOUT_RULES, ...FONT_SIZE_RULES]

export interface CheckRenderedOptions {
  /** The origin serving `/frames/`. */
  baseUrl: string
  /** The board folder, which the frame's own sheets are read from. */
  root: string
  frame: RenderedTarget
  config: ProjectChecks
}

/**
 * Runs every browser rule on one frame at its layout size, in light and in
 * dark, and merges the two. A rule tripping in one theme alone names that
 * theme in its message. A missing face is measured in the fallback the board
 * shows rather than refused, since the board shows it too. The declaration
 * rule reads no theme, so it runs on the first theme's page alone.
 */
export async function checkRendered(
  browser: Browser,
  { baseUrl, root, frame, config }: CheckRenderedOptions,
): Promise<Finding[]> {
  const [project = '', page = '', name = ''] = frame.ref.split('/')
  const source = readFrame({ root, project, page, name })
  const byTheme = new Map<Theme, Finding[]>()
  let declarations: Finding[] = []
  for (const theme of THEMES) {
    const opened = await openFrame(browser, {
      baseUrl,
      ref: frame.ref,
      box: frame.box,
      theme,
      fonts: 'wait',
    })
    try {
      byTheme.set(theme, [
        ...(await checkLayout(opened.page, frame)),
        ...(config.minFontSize === undefined
          ? []
          : await checkFontSize(opened.page, frame, config.minFontSize)),
      ])
      if (theme === THEMES[0]) {
        declarations = await checkDeclarations(opened.page, source)
      }
    } finally {
      await opened.close()
    }
  }
  return [...mergeThemes(byTheme), ...declarations]
}

/**
 * One finding per rule across themes, in rule order. A rule both themes trip
 * keeps the first theme's message as is.
 */
function mergeThemes(byTheme: Map<Theme, Finding[]>): Finding[] {
  const merged: Finding[] = []
  for (const rule of THEMED_RULES) {
    const tripped = THEMES.flatMap((theme) => {
      const found = byTheme.get(theme)?.find((each) => each.rule === rule.id)
      return found ? [{ theme, found }] : []
    })
    const [first] = tripped
    if (!first) continue
    merged.push(
      tripped.length === THEMES.length
        ? first.found
        : {
            ...first.found,
            message: `In ${first.theme}, ${first.found.message}`,
          },
    )
  }
  return merged
}
