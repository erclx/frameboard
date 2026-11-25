import { createStore } from 'zustand/vanilla'

/** What the dialog shows, a search for free media or a generated image. */
export type SourcingView = 'find' | 'generate'

interface SourcingDialogState {
  open: boolean
  view: SourcingView
  /** The view it opened on, whose button takes the focus back. */
  opener: SourcingView
  /** An insert is out, which holds the dialog open until it lands or is refused. */
  inserting: boolean
  /** Why the last insert was refused. */
  refusal: string | null
}

/** The one dialog Find and Generate share, held here so the palette can open it. */
export const sourcingDialogStore = createStore<SourcingDialogState>()(() => ({
  open: false,
  view: 'find',
  opener: 'find',
  inserting: false,
  refusal: null,
}))

export function openSourcing(view: SourcingView): void {
  sourcingDialogStore.setState({
    open: true,
    view,
    opener: view,
    refusal: null,
  })
}

/** Closes the dialog, unless an insert is out, which closes it once it lands. */
export function closeSourcing(): void {
  sourcingDialogStore.setState((state) =>
    state.inserting ? state : { open: false, refusal: null },
  )
}
