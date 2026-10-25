import { useLive } from '@/client/live/store'

/** True once the server has said this tab reads, and false before it answers. */
export function useViewOnly(): boolean {
  return useLive(
    (state) => state.connected && state.accessKnown && !state.canWrite,
  )
}
