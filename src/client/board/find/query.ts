import { useEffect, useRef, useState } from 'react'

import { useLive } from '@/client/live/store'
import type { FindResult } from '@/shared/records/find'

/** Milliseconds of quiet in the field before a search goes out, so typing queues no read per key. */
export const QUIET_MS = 120

export type FindAnswer =
  /** The field is blank, so nothing was sent. */
  | { status: 'idle' }
  /** The first search for this field is on its way. */
  | { status: 'loading' }
  | {
      status: 'ready'
      result: FindResult
      /** The page on the canvas when the answer arrived, whose group leads. */
      lead: string
      /** True while a newer search is on its way. */
      updating: boolean
    }
  | { status: 'refused'; message: string }

export type LoadFind = (project: string, query: string) => Promise<FindResult>

type Held =
  | { key: string; status: 'ready'; result: FindResult; lead: string }
  | { key: string; status: 'refused'; message: string }

/**
 * The search for `query` across `project`, sent after `QUIET_MS` of quiet
 * and again when a reload names one of the project's frames. An answer older
 * than the last search sent is dropped, the last answer stays up marked as
 * updating until the next lands, and a blank field answers idle with nothing
 * sent.
 */
export function useFindAnswer(
  project: string,
  query: string,
  page: string,
  load: LoadFind = fetchFind,
): FindAnswer {
  const [held, setHeld] = useState<Held | null>(null)
  const sent = useRef(0)
  const lead = useRef(page)
  useEffect(() => {
    lead.current = page
  }, [page])
  const version = useLive((state) => projectReloads(state.reloads, project))
  const blank = query.trim() === ''
  const key = `${version}\n${project}\n${query}`

  useEffect(() => {
    const seq = ++sent.current
    if (blank) return
    const timer = setTimeout(() => {
      load(project, query).then(
        (result) => {
          if (seq !== sent.current) return
          setHeld({ key, status: 'ready', result, lead: lead.current })
        },
        (error: unknown) => {
          if (seq !== sent.current) return
          const message = error instanceof Error ? error.message : String(error)
          setHeld({ key, status: 'refused', message })
        },
      )
    }, QUIET_MS)
    return () => clearTimeout(timer)
  }, [project, query, blank, key, load])

  if (blank) return { status: 'idle' }
  if (held?.status === 'ready') {
    const { result, lead: leading } = held
    return {
      status: 'ready',
      result,
      lead: leading,
      updating: held.key !== key,
    }
  }
  if (held?.status === 'refused' && held.key === key) return held
  return { status: 'loading' }
}

/** A count that moves whenever any frame of the project reloads. */
function projectReloads(
  reloads: Readonly<Record<string, number>>,
  project: string,
): number {
  let total = 0
  for (const [ref, count] of Object.entries(reloads)) {
    if (ref.startsWith(`${project}/`)) total += count
  }
  return total
}

/** Reads a search from the board's server, throwing the refusal's message. */
export async function fetchFind(
  project: string,
  query: string,
  send: typeof fetch = fetch,
): Promise<FindResult> {
  const params = new URLSearchParams({ project, q: query })
  const response = await send(`/api/find?${params}`)
  const envelope = (await response.json().catch(() => null)) as
    | { ok: true; data: FindResult }
    | { ok: false; error: { message: string } }
    | null
  if (!envelope) throw new Error(`The board answered ${response.status}.`)
  if (!envelope.ok) throw new Error(envelope.error.message)
  return envelope.data
}
