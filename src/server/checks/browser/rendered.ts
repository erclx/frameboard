import type { Browser } from 'playwright-core'

import { finishAnimations, settleResize } from '@/server/capture/fit'
import { openFrame, pageSize } from '@/server/capture/render'
import type { Device, Turn } from '@/shared/frame-device'
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
  /** The frame at the box it shows, with the device its page draws under at that width. */
  frame: RenderedTarget & { device?: Device | null; turn?: Turn }
  config: ProjectChecks
}

/**
 * Runs every browser rule in both themes and merges them, measuring a missing
 * face in the board's fallback rather than refusing, after animations finish.
 */
export async function checkRendered(
  browser: Browser,
  { baseUrl, root, frame: shown, config }: CheckRenderedOptions,
): Promise<Finding[]> {
  // A phone's page starts under its status bar, so the rules read that page.
  const { device, turn, ...target } = shown
  const frame = { ...target, box: pageSize(target.box, device, turn) }
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
      // Finished, since a `wait` open can leave an entrance mid-slide.
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
