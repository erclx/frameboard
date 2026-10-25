/**
 * The looks a new project can start from, each accent paired by hand with a
 * dark value, so both themes hold without a derived color. The keys are the
 * values `project tokens --accent` and the route take.
 */
export const STARTER_ACCENTS = {
  blue: { light: '#2f7bf0', dark: '#4e92f6' },
  red: { light: '#e5484d', dark: '#ff6369' },
  green: { light: '#30a46c', dark: '#3dd68c' },
  orange: { light: '#f76b15', dark: '#ff801f' },
  purple: { light: '#8e4ec6', dark: '#9a5cd0' },
} as const

export type StarterAccent = keyof typeof STARTER_ACCENTS

/** The served faces a starter sheet may name, keyed by their face folder. */
export const STARTER_FONTS = {
  geist: { family: 'Geist', stack: 'Geist, sans-serif' },
  'geist-mono': { family: 'Geist Mono', stack: "'Geist Mono', monospace" },
} as const

export type StarterFont = keyof typeof STARTER_FONTS

export interface StarterLook {
  accent: StarterAccent
  font: StarterFont
}

export const DEFAULT_LOOK: StarterLook = { accent: 'blue', font: 'geist' }

export function isStarterAccent(value: string): value is StarterAccent {
  return Object.hasOwn(STARTER_ACCENTS, value)
}

export function isStarterFont(value: string): value is StarterFont {
  return Object.hasOwn(STARTER_FONTS, value)
}

/** A project token sheet setting the names the fixture sheets use, light then dark. */
export function starterSheet({ accent, font }: StarterLook): string {
  const pair = STARTER_ACCENTS[accent]
  return `:root {
  --accent: ${pair.light};
  --surface: #ffffff;
  --text: #111111;
  --muted: #6b7280;
  --border: #e5e7eb;
  --radius: 10px;
  --font-text: ${STARTER_FONTS[font].stack};
}

[data-theme='dark'] {
  --accent: ${pair.dark};
  --surface: #111111;
  --text: #ededed;
  --muted: #9ca3af;
  --border: #2e2e2e;
}
`
}
