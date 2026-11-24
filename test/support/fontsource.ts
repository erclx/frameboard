/** One family as Fontsource's list spells it. */
export interface RawFamily {
  id: string
  family: string
  subsets: string[]
  weights: number[]
  styles: string[]
  defSubset: string
  variable: boolean
  category: string
  license: string
  type: string
}

/** Lora, a variable serif of seven subsets in two styles, unless overridden. */
export function rawFamily(overrides: Partial<RawFamily> = {}): RawFamily {
  return {
    id: 'lora',
    family: 'Lora',
    subsets: [
      'cyrillic',
      'cyrillic-ext',
      'latin',
      'latin-ext',
      'math',
      'symbols',
      'vietnamese',
    ],
    weights: [400, 500, 600, 700],
    styles: ['italic', 'normal'],
    defSubset: 'latin',
    variable: true,
    category: 'serif',
    license: 'OFL-1.1',
    type: 'google',
    ...overrides,
  }
}

/** Lato, a static sans of two subsets and five weights, unless overridden. */
export function staticFamily(overrides: Partial<RawFamily> = {}): RawFamily {
  return rawFamily({
    id: 'lato',
    family: 'Lato',
    subsets: ['latin', 'latin-ext'],
    weights: [100, 300, 400, 700, 900],
    variable: false,
    category: 'sans-serif',
    ...overrides,
  })
}

const RELEASE = '5.3.0'

/** The by-id record, a list entry with its release and its files per weight, style, and subset. */
function record(raw: RawFamily) {
  const subsets = Object.fromEntries(
    raw.subsets.map((subset) => [subset, { url: {} }]),
  )
  const styles = Object.fromEntries(raw.styles.map((style) => [style, subsets]))
  return {
    ...raw,
    npmVersion: RELEASE,
    variants: Object.fromEntries(raw.weights.map((each) => [each, styles])),
  }
}

/** A package sheet as Fontsource writes one, a face per subset, null for a sheet the package lacks. */
function sheet(raw: RawFamily, name: string): string | null {
  const italic = name.endsWith('italic.css')
  const style = italic ? 'italic' : 'normal'
  const first = Math.min(...raw.weights)
  const last = Math.max(...raw.weights)
  const weight = raw.variable ? 'wght' : /^(\d+)/.exec(name)?.[1]
  const known = raw.variable
    ? name === (italic ? 'wght-italic.css' : 'index.css')
    : raw.weights.includes(Number(weight))
  if (!known || !raw.styles.includes(style)) return null
  return raw.subsets
    .map((subset) => {
      const stem = `${raw.id}-${subset}-${weight}-${style}`
      const source = raw.variable
        ? `url(./files/${stem}.woff2) format('woff2-variations')`
        : `url(./files/${stem}.woff2) format('woff2'), url(./files/${stem}.woff) format('woff')`
      return `/* ${stem} */
@font-face {
  font-family: '${raw.family}${raw.variable ? ' Variable' : ''}';
  font-style: ${style};
  font-display: swap;
  font-weight: ${raw.variable ? `${first} ${last}` : weight};
  src: ${source};
  unicode-range: ${subset === 'latin' ? 'U+0000-00FF,U+0131' : 'U+0460-052F'};
}`
    })
    .join('\n\n')
}

interface Asked {
  url: URL
  userAgent: string | null
}

/**
 * A fake Fontsource holding the given families, its API and the package host
 * both. A font file answers `bytes`, else its own name as text, and `failing`
 * names a URL fragment answering 500. Every request is recorded.
 */
export function fontsource(
  families: RawFamily[],
  {
    failing = null,
    bytes,
  }: { failing?: string | null; bytes?: Uint8Array } = {},
) {
  const asked: Asked[] = []
  const send = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input)
    asked.push({
      url,
      userAgent: new Headers(init?.headers).get('User-Agent'),
    })
    if (failing !== null && url.href.includes(failing)) {
      return new Response('', { status: 500 })
    }
    const missing = new Response('{}', { status: 404 })
    if (url.host === 'api.fontsource.org') {
      if (url.pathname === '/v1/fonts') return Response.json(families)
      const raw = families.find(
        (each) => url.pathname === `/v1/fonts/${each.id}`,
      )
      return raw ? Response.json(record(raw)) : missing
    }
    const inPackage =
      /^\/npm\/@fontsource(-variable)?\/([^@/]+)@([^/]+)\/(.+)$/.exec(
        url.pathname,
      )
    const [, variable, id, release, path = ''] = inPackage ?? []
    const raw = families.find((each) => each.id === id)
    if (
      raw === undefined ||
      release !== RELEASE ||
      raw.variable !== (variable !== undefined)
    ) {
      return missing
    }
    if (path === 'LICENSE') {
      return new Response(
        `Copyright 2011 The ${raw.family} Project Authors\n\nThis Font Software is licensed under ${raw.license}.\n`,
      )
    }
    if (path.startsWith('files/')) {
      return new Response(
        bytes ? new Uint8Array(bytes) : path.slice('files/'.length),
      )
    }
    const css = sheet(raw, path)
    return css === null ? missing : new Response(css)
  }) as typeof fetch
  return { send, asked }
}
