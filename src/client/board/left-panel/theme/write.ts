import { toast } from '@/client/components/ui/toast'
import { BoardWriteError, writeBoard } from '@/client/live/write'
import type { FontRemove, SavedFont } from '@/shared/records/sourcing'
import type { TokenEditResult } from '@/shared/records/tokens'

/** One token edit as `POST /api/tokens/edit` takes it, less the project and the hash the tab adds. */
export type TokenChange = (
  | { name: string; side: 'light' | 'dark' | 'both'; value: string }
  | { name: string; reset: true }
) & {
  /** The sheet the edit writes, the project's own when absent. */
  sheet?: TokenSheet
}

export type TokenSheet = 'project' | 'board'

export interface TokenWriteDeps {
  send?: typeof fetch
  /** Shows a refusal, the kit's toast by default. */
  notify?: (refusal: { title: string; description: string }) => void
}

/**
 * Sends one token edit from the sheet `hash` names, null for a project with no
 * sheet, every refusal raising one error toast.
 */
export async function writeToken(
  project: string,
  hash: string | null,
  change: TokenChange,
  {
    send = fetch,
    notify = (refusal) => toast.add({ ...refusal, type: 'error' }),
  }: TokenWriteDeps = {},
): Promise<TokenEditResult | null> {
  try {
    return await writeBoard<TokenEditResult>(
      '/api/tokens/edit',
      { project, hash, ...change },
      'POST',
      send,
    )
  } catch (error) {
    notify({
      title: `Couldn't change ${change.name.replace(/^--/, '')}`,
      description:
        error instanceof BoardWriteError && error.code === 'stale-tokens'
          ? 'The token sheet changed since the tab read it. Try again on the value it shows now.'
          : error instanceof Error
            ? error.message
            : String(error),
    })
    return null
  }
}

function fontsBase(project: string): string {
  return `/api/projects/${encodeURIComponent(project)}/sourcing/fonts`
}

/** Installs a Fontsource family into the project as one undo step, keeping the usual weights. */
export function installFont(
  project: string,
  id: string,
  query: string | null,
  send: typeof fetch = fetch,
): Promise<SavedFont> {
  return writeBoard<SavedFont>(
    `${fontsBase(project)}/save`,
    { id, query },
    'POST',
    send,
  )
}

/** Removes an installed family's folder as one undo step. */
export function removeFont(
  project: string,
  id: string,
  send: typeof fetch = fetch,
): Promise<FontRemove> {
  return writeBoard<FontRemove>(
    `${fontsBase(project)}/remove`,
    { id },
    'POST',
    send,
  )
}
