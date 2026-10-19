const MAC_PARTS: Readonly<Record<string, string>> = {
  $mod: '⌘',
  Meta: '⌘',
  Control: '⌃',
  Alt: '⌥',
  Shift: '⇧',
}

const MAC_ORDER = ['Control', 'Alt', 'Shift', '$mod', 'Meta']

const OTHER_PARTS: Readonly<Record<string, string>> = {
  $mod: 'Ctrl',
  Meta: 'Win',
  Control: 'Ctrl',
  Alt: 'Alt',
  Shift: 'Shift',
}

const KEYS: Readonly<Record<string, string>> = {
  Backslash: '\\',
  Equal: '=',
  Minus: '-',
  Escape: 'Esc',
}

/** Whether the board runs on a Mac, which names `$mod` Cmd rather than Ctrl, as tinykeys does. */
export const IS_MAC = /Mac|iPod|iPhone|iPad/.test(navigator.platform)

/**
 * A tinykeys binding as the board prints it, such as `⌘\` for
 * `$mod+Backslash` on a Mac and `Ctrl+\` elsewhere, and `⇧1` for
 * `Shift+Digit1`.
 */
export function keyLabel(binding: string, mac: boolean = IS_MAC): string {
  return keyParts(binding, mac).join(mac ? '' : '+')
}

/**
 * The chips a binding prints as, one per modifier and one for the key, such
 * as `⇧` and `1` for `Shift+Digit1`. A shifted symbol such as `?` already
 * names the Shift, so `Shift+?` prints as `?` alone.
 */
export function keyParts(binding: string, mac: boolean = IS_MAC): string[] {
  const parts = binding.split('+')
  const key = parts.pop() ?? ''
  const names = mac ? MAC_PARTS : OTHER_PARTS
  // A Mac prints its modifiers in the system's own order, Shift before Cmd.
  const ordered = mac
    ? [...parts].sort((a, b) => MAC_ORDER.indexOf(a) - MAC_ORDER.indexOf(b))
    : parts
  const shown = isSymbol(key)
    ? ordered.filter((part) => part !== 'Shift')
    : ordered
  return [...shown.map((part) => names[part] ?? part), keyName(key)]
}

/** A single character that is neither a letter nor a digit, which Shift types rather than modifies. */
function isSymbol(key: string): boolean {
  return key.length === 1 && !/[a-z0-9]/i.test(key)
}

function keyName(key: string): string {
  const named = KEYS[key]
  if (named) return named
  const code = /^(?:Key|Digit)(.)$/.exec(key)
  return (code?.[1] ?? key).toUpperCase()
}
