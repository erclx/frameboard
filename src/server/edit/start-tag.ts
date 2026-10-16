export interface StartTagScan {
  /** The offset of the self-closing solidus, when the tag has one. */
  readonly slash: number | undefined
  /** Every attribute name the tag states, lowercased, duplicates included. */
  readonly names: readonly string[]
}

type State =
  | 'tagName'
  | 'beforeAttrName'
  | 'attrName'
  | 'afterAttrName'
  | 'beforeValue'
  | 'quoted'
  | 'unquoted'

function isSpace(char: string | undefined): boolean {
  return (
    char === ' ' ||
    char === '\t' ||
    char === '\n' ||
    char === '\f' ||
    char === '\r'
  )
}

/**
 * Scans one start tag through the tokenizer's start-tag states, since parse5
 * records neither the self-closing flag nor a duplicated attribute. A `/`
 * ending an unquoted value is part of the value, so `<circle id=x/>` is not
 * self-closed, and only following the states tells the two apart.
 */
export function scanStartTag(
  source: string,
  tag: { readonly startOffset: number; readonly endOffset: number },
): StartTagScan {
  const names: string[] = []
  let state: State = 'tagName'
  let quote = ''
  let nameStart = 0
  let slash: number | undefined
  // The tag ends at its `>`, which the loop leaves out.
  const end = tag.endOffset - 1
  for (let at = tag.startOffset + 1; at < end; at += 1) {
    const char = source[at]
    // A solidus counts only when the next character closes the tag.
    slash = undefined
    switch (state) {
      case 'tagName':
        if (isSpace(char)) state = 'beforeAttrName'
        else if (char === '/') {
          state = 'beforeAttrName'
          slash = at
        }
        break
      case 'beforeAttrName':
        if (char === '/') slash = at
        else if (!isSpace(char)) {
          state = 'attrName'
          nameStart = at
        }
        break
      case 'attrName':
        if (isSpace(char) || char === '/' || char === '=') {
          names.push(source.slice(nameStart, at).toLowerCase())
          if (char === '=') state = 'beforeValue'
          else if (char === '/') {
            state = 'beforeAttrName'
            slash = at
          } else state = 'afterAttrName'
        }
        break
      case 'afterAttrName':
        if (char === '/') {
          state = 'beforeAttrName'
          slash = at
        } else if (char === '=') state = 'beforeValue'
        else if (!isSpace(char)) {
          state = 'attrName'
          nameStart = at
        }
        break
      case 'beforeValue':
        if (char === '"' || char === "'") {
          quote = char
          state = 'quoted'
        } else if (!isSpace(char)) state = 'unquoted'
        break
      case 'quoted':
        if (char === quote) state = 'beforeAttrName'
        break
      case 'unquoted':
        if (isSpace(char)) state = 'beforeAttrName'
        break
    }
  }
  if (state === 'attrName')
    names.push(source.slice(nameStart, end).toLowerCase())
  return { slash, names }
}
