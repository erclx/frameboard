/**
 * Whether a change is the browser's undo reaching a field the developer left,
 * which Chromium runs when a press falls through the board, and which would
 * otherwise commit on the next blur.
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
