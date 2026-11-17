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
 * The cases that write the served board, in the order they run. A fresh
 * browser reads the server's whole change log as unseen, so a raw write raises
 * a toast and a glow in whichever later case its watch batch lands in, and a
 * board edit leaves Undo and Redo lit there. A case that writes joins this
 * list, so every other case reads a pristine server, alone or in a full sweep.
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
  'inspector-widths',
  'inspector-widths-menu',
  'inspector-widths-hug',
  'motion-held',
  'motion-ended',
  'export-filmstrip',
  'page-transition',
  'page-transition-own',
  'present-steps',
  'controls-edit',
  'controls-play',
]

const CHANGE_LOG = join(SERVED_BOARD, '.run/changes/log.json')

let previousSection = 'the start of the run'

/**
 * Wraps a case outside `WRITING_SECTIONS` so its setup throws when the served
 * board already holds a change log, which only a case that wrote the board
 * before it can have left. The previous case is named as the likely writer,
 * since the log lands after the write and the next setup is the first to see it.
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
 * Holds a case's page load until the served board's last write has been
 * through the watch. A case restores its files when its page closes and the
 * next one writes its own in setup, and either write reaches a page that
 * loaded in the meantime as a reload, which a case waiting on a state its
 * page has not reached never recovers from.
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
