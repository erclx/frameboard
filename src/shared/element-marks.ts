/** The tags a browser gives no box, which no Layers row lists and no canvas press picks. */
export const UNRENDERED_TAGS: ReadonlySet<string> = new Set([
  'script',
  'style',
  'template',
  'noscript',
  'link',
  'meta',
])

/** Marks an element the canvas pick passes over, whatever its value, while its Layers row still selects it. */
export const LOCKED_ATTRIBUTE = 'data-locked'

/** Keeps the inline `display` a hide replaced, which a show puts back. */
export const SHOWN_DISPLAY_ATTRIBUTE = 'data-shown-display'
