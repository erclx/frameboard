import type { Browser } from 'playwright-core'

import { finishAnimations, settleResize } from '@/server/capture/fit'
import { openFrame } from '@/server/capture/render'
import type { ProjectChecks } from '@/shared/records/board'
import type { Finding } from '@/shared/records/check'
import { type Theme, THEMES } from '@/shared/theme'

import { readFrame } from '../frame-source'
import { withoutOff } from '../rule'
import { checkContrast, CONTRAST_RULES } from './contrast'
import { checkDeclarations, DECLARATION_RULES } from './declarations'
import { checkFontSize, FONT_SIZE_RULES } from './font-size'
import { checkLayout, LAYOUT_RULES, type RenderedTarget } from './layout'
import { checkScrollEffect, SCROLL_EFFECT_RULES } from './scroll-effect'

/** Every browser rule, in the order `docs` lists them. */
export const BROWSER_RULES = [
  ...LAYOUT_RULES,
  ...FONT_SIZE_RULES,
  ...CONTRAST_RULES,
  ...DECLARATION_RULES,
  ...SCROLL_EFFECT_RULES,
]

/** The rules that read one theme's page and land one finding at most. */
const THEMED_RULES = [...LAYOUT_RULES, ...FONT_SIZE_RULES, ...CONTRAST_RULES]

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
 * shows rather than refused, since the board shows it too. Finite animations
 * finish before any rule reads, so an entrance is measured at rest. The declaration
 * and scroll-effect rules read no theme, so they run on the first theme's
 * page alone. A rule the project turned off lands no finding.
 */
export async function checkRendered(
  browser: Browser,
  { baseUrl, root, frame, config }: CheckRenderedOptions,
): Promise<Finding[]> {
  const [project = '', page = '', name = ''] = frame.ref.split('/')
  const source = readFrame({ root, project, page, name })
  const byTheme = new Map<Theme, Finding[]>()
  let unthemed: Finding[] = []
  for (const theme of THEMES) {
    const opened = await openFrame(browser, {
      baseUrl,
      ref: frame.ref,
      box: frame.box,
      theme,
      fonts: 'wait',
    })
    try {
      // A `wait` open leaves an entrance wherever the load ended, so the
      // rules would read a frame mid-slide rather than where the board rests.
      await settleResize(opened.page)
      await opened.page.evaluate(finishAnimations)
      byTheme.set(theme, [
        ...(await checkLayout(opened.page, frame)),
        ...(config.minFontSize === undefined
          ? []
          : await checkFontSize(opened.page, frame, config.minFontSize)),
        ...(config.minContrast === undefined
          ? []
          : await checkContrast(opened.page, frame, config.minContrast)),
      ])
      if (theme === THEMES[0]) {
        unthemed = [
          ...(await checkDeclarations(opened.page, source)),
          ...(await checkScrollEffect(opened.page, frame)),
        ]
      }
    } finally {
      await opened.close()
    }
  }
  return withoutOff([...mergeThemes(byTheme), ...unthemed], config.off)
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
