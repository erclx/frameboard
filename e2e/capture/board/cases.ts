import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import type { CaptureCase } from '../types'
import { agentCases } from './agent'
import { canvasCases } from './canvas'
import { chromeCases } from './chrome'
import { editingCases } from './editing'
import { HOME_BUNDLE_CASES, homeCases } from './home'
import { inspectorCases } from './inspector'
import { menusCases } from './menus'
import { SERVED_BOARD } from './setup'

/** Every case in run order, before the writing sections are pulled to the end. */
const CASES: CaptureCase[] = [
  ...homeCases(),
  ...(['light', 'dark'] as const).flatMap((theme): CaptureCase[] => [
    ...chromeCases(theme),
    ...canvasCases(theme),
    ...editingCases(theme),
    ...agentCases(theme),
    ...inspectorCases(theme),
    ...menusCases(theme),
  ]),
  ...HOME_BUNDLE_CASES,
]

/**
 * Cases that write the served board, run last in this order, since a write
 * leaks a toast, a glow, or lit Undo into whichever case runs next.
 */
const WRITING_SECTIONS = [
  'rectangle-drawn-free',
  'text-hugs',
  'linked-widths',
  'colors-no-tokens',
  'use-token',
  'stroke-no-tokens',
  'replace-colors',
  'replace-colors-done',
  'select-color',
  'select-color-done',
  'scroll-rail',
  'scroll-no-ghost',
  'device-bezel',
  'device-island-wide',
  'device-turned',
  'device-upright-overflow',
  'device-turned-overflow',
  'device-foldable-closed',
  'device-foldable-half',
  'device-foldable-open',
  'present-device',
  'present-phone-tall',
  'play-entered-phone-tall',
  'present-turned',
  'play-entered-turned',
  'inspector-widths',
  'inspector-widths-menu',
  'inspector-widths-hug',
  'element-tilt',
  'element-padding',
  'motion-held',
  'motion-ended',
  'export-filmstrip',
  'page-transition',
  'page-transition-own',
  'present-steps',
  'step-effect',
  'presenter-view',
  'controls-edit',
  'controls-play',
  'controls-play-left',
  // Last, since their model and its viewer stay in the served project's assets.
  'model-section',
  'model-turning',
]

const CHANGE_LOG = join(SERVED_BOARD, '.run/changes/log.json')

let previousSection = 'the start of the run'

/**
 * Throws when a non-writing case finds a change log, naming the case before it,
 * since the log lands after a write and the next setup is the first to see it.
 */
function onPristineServer({
  section,
  setup,
  ...rest
}: CaptureCase): CaptureCase {
  return {
    ...rest,
    section,
    setup: async (page) => {
      if (existsSync(CHANGE_LOG)) {
        throw new Error(
          `${section} found a change log on the served board, so a case at or before ${previousSection} wrote it. Add that case to WRITING_SECTIONS in e2e/capture/board/cases.ts.`,
        )
      }
      previousSection = section
      await setup?.(page)
    },
  }
}

/**
 * How long after a write to the served board its watch batch can still reach
 * a page. A batch closes 250 ms after its first event at the latest, and the
 * rescan and the reload broadcast follow it.
 */
const WATCH_SETTLE_MS = 1000

/** The newest modification time under `folder`, skipping dot-named entries as the board's watch does. */
function newestWrite(folder: string): number {
  let newest = statSync(folder).mtimeMs
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    const path = join(folder, entry.name)
    newest = Math.max(
      newest,
      entry.isDirectory() ? newestWrite(path) : statSync(path).mtimeMs,
    )
  }
  return newest
}

/**
 * Holds a page load until the board's last write is through the watch, since a
 * late write reloads the page and strands a case waiting on its state.
 */
function onWatchSettled(captureCase: CaptureCase): CaptureCase {
  const { setup } = captureCase
  return {
    ...captureCase,
    setup: async (page) => {
      await setup?.(page)
      const wait = newestWrite(SERVED_BOARD) + WATCH_SETTLE_MS - Date.now()
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
    },
  }
}

export const BOARD_CASES: CaptureCase[] = [
  ...CASES.filter(({ section }) => !WRITING_SECTIONS.includes(section)).map(
    onPristineServer,
  ),
  ...WRITING_SECTIONS.flatMap((writing) =>
    CASES.filter(({ section }) => section === writing),
  ),
].map(onWatchSettled)
