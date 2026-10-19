import { useEffect, useState } from 'react'

import { useLive } from '@/client/live/store'
import type { TokenTable } from '@/shared/records/tokens'

/**
 * The project's token table, read again on every board message, which every
 * watched batch sends. Undefined while the first read runs and null when it
 * fails, and a slower earlier read never replaces a later one.
 */
export function useTokenTable(
  project: string,
  load: (project: string) => Promise<TokenTable | null> = fetchTokenTable,
): TokenTable | null | undefined {
  const board = useLive((state) => state.board)
  const [table, setTable] = useState<TokenTable | null | undefined>()

  useEffect(() => {
    let current = true
    void load(project)
      .catch(() => null)
      .then((next) => {
        if (current) setTable(next)
      })
    return () => {
      current = false
    }
  }, [project, board, load])

  return table
}

export async function fetchTokenTable(
  project: string,
): Promise<TokenTable | null> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(project)}/tokens`,
  )
  const body = (await response.json()) as TokensBody
  return body.ok ? body.data : null
}

type TokensBody = { ok: true; data: TokenTable } | { ok: false }
