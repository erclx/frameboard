import { toast } from '@/client/components/ui/toast'
import { BoardWriteError, writeBoard } from '@/client/live/write'
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
 * Sends one token edit made from the sheet `hash` names, the one
 * `change.sheet` picks, null for a project with no sheet of its own, and
 * answers what landed or null. Every refusal raises
 * one error toast, a sheet changed since the read saying so in its words.
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
