import { createStore } from 'zustand/vanilla'

/** Whether the edit confirmation is open, which the pill, the inspector, and a toast each open. */
export const editAccessStore = createStore(() => ({ open: false }))

export function askToEdit(): void {
  editAccessStore.setState({ open: true })
}

export function closeEditAccess(): void {
  editAccessStore.setState({ open: false })
}
