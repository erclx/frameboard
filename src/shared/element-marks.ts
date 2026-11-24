/** The tags a browser gives no box, which no Layers row lists and no canvas press picks. */
export const UNRENDERED_TAGS: ReadonlySet<string> = new Set([
  'script',
  'style',
  'template',
  'noscript',
  'link',
  'meta',
])
