import { rename, rm } from 'node:fs/promises'
import { relative } from 'node:path'

import type { Journal } from '../../src/server/board/journal'

/** One call a verb made into the journal, with paths relative to the board root. */
export type JournalCall =
  | {
      kind: 'entry'
      page: string
      frame: string
      before: unknown
      after: unknown
    }
  | {
      kind: 'section'
      page: string
      section: string
      before: unknown
      after: unknown
    }
  | { kind: 'pages'; project: string; before: string[]; after: string[] }
  | { kind: 'moved'; from: string; to: string }
  | { kind: 'created'; path: string }
  | { kind: 'removed'; path: string }

/**
 * A journal that does what a verb asks of it on disk and lists each call, so a
 * test reads what the verb reported against what it changed.
 */
export function recordingJournal(root: string): {
  journal: Journal
  calls: JournalCall[]
} {
  const calls: JournalCall[] = []
  const at = (path: string) => relative(root, path)
  return {
    calls,
    journal: {
      entry: (page, frame, before, after) => {
        calls.push({ kind: 'entry', page: at(page), frame, before, after })
      },
      section: (page, section, before, after) => {
        calls.push({ kind: 'section', page: at(page), section, before, after })
      },
      pages: (project, before, after) => {
        calls.push({ kind: 'pages', project: at(project), before, after })
      },
      moved: async (from, to) => {
        await rename(from, to)
        calls.push({ kind: 'moved', from: at(from), to: at(to) })
      },
      created: async (path) => {
        calls.push({ kind: 'created', path: at(path) })
      },
      removed: async (path) => {
        await rm(path, { recursive: true })
        calls.push({ kind: 'removed', path: at(path) })
      },
    },
  }
}
