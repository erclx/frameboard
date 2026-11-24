import { createStore } from 'zustand/vanilla'

interface EditAccessState {
  /** Whether the confirmation is open, which the pill, the inspector, and a toast each open. */
  open: boolean
  /** Why the last grant was refused, null until one is and again on each open. */
  refusal: string | null
}

const CLOSED: EditAccessState = { open: false, refusal: null }

export const editAccessStore = createStore<EditAccessState>(() => CLOSED)

export function askToEdit(): void {
  editAccessStore.setState({ open: true, refusal: null })
}

export function closeEditAccess(): void {
  editAccessStore.setState(CLOSED)
}
