import { useLive } from '@/client/live/store'

/** True once the server has said this tab reads, and false before it answers. */
export function useViewOnly(): boolean {
  return useLive(
    (state) => state.connected && state.accessKnown && !state.canWrite,
  )
}

/** True in a tab that reads on a server started with the Edit button. */
export function useEditOffered(): boolean {
  const viewOnly = useViewOnly()
  const offered = useLive((state) => state.editButton)
  return viewOnly && offered
}
