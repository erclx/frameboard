/**
 * Whether a change event is the browser's undo or redo reaching a field the
 * developer has left. Chromium runs one on the last field edited when a press
 * falls through the board, and taking it as typing would commit it on the
 * next blur.
 */
export function isStrayHistory(event: {
  nativeEvent: Event
  currentTarget: Element
}): boolean {
  const { nativeEvent, currentTarget } = event
  if (!(nativeEvent instanceof InputEvent)) return false
  const history =
    nativeEvent.inputType === 'historyUndo' ||
    nativeEvent.inputType === 'historyRedo'
  return history && currentTarget.ownerDocument.activeElement !== currentTarget
}
