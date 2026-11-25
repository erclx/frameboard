import { useRef } from 'react'

import type { TokenTable } from '@/shared/records/tokens'

import { type TokenChange, type TokenSheet, writeToken } from './write'

/** The sheet hash an edit landed over and the hash it wrote, until the table reads the sheet again. */
interface Landed {
  over: string | null
  hash: string
}

/** Sends one edit of a token, answering whether it landed. */
export type WriteRow = (change: TokenChange) => Promise<boolean>

/** What writes edits into one sheet. */
export type SheetWriter = (sheet: TokenSheet) => WriteRow

/**
 * Sends the project's token edits one at a time, each made from the sheet the
 * last one wrote. Held above the dialog, so neither a section switch nor a
 * close drops an edit or its hash.
 */
export function useTokenWriter(
  project: string,
  table: TokenTable | null | undefined,
  write: typeof writeToken = writeToken,
): SheetWriter {
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  const landed = useRef<Partial<Record<TokenSheet, Landed>>>({})

  return (sheet) => (change) => {
    const run = queue.current.then(async () => {
      const read =
        table?.sheets.find((candidate) => candidate.kind === sheet)?.hash ??
        null
      const held = landed.current[sheet]
      const hash = held && held.over === read ? held.hash : read
      const result = await write(project, hash, { ...change, sheet })
      if (result) {
        landed.current = {
          ...landed.current,
          [sheet]: { over: read, hash: result.hash },
        }
      }
      return result !== null
    })
    queue.current = run
    return run
  }
}
