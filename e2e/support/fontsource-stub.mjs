/**
 * Preloaded into a `frameboard` child with `node --import`, standing in for
 * Fontsource's API and its package host, so a spec installs a font with no
 * network. Its one family is served from a bundled face's own bytes.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const FAMILY = {
  id: 'stub-display',
  family: 'Stub Display',
  subsets: ['latin'],
  weights: [400, 500, 600, 700],
  styles: ['normal'],
  defSubset: 'latin',
  variable: true,
  category: 'serif',
  license: 'OFL-1.1',
}

const RECORD = {
  ...FAMILY,
  npmVersion: '5.3.0',
  variants: { 400: { normal: {} } },
}

const FILE = 'stub-display-latin-wght-normal.woff2'

const SHEET = `@font-face {
  font-family: 'Stub Display Variable';
  font-style: normal;
  font-weight: 400 700;
  src: url(./files/${FILE}) format('woff2-variations');
  unicode-range: U+0000-00FF;
}`

const face = () =>
  readFileSync(
    createRequire(import.meta.url).resolve(
      '@fontsource-variable/caveat/files/caveat-latin-wght-normal.woff2',
    ),
  )

const API = 'https://api.fontsource.org/v1/fonts'
const PACKAGE =
  'https://cdn.jsdelivr.net/npm/@fontsource-variable/stub-display@5.3.0'

const ANSWERS = {
  [API]: () => Response.json([FAMILY]),
  [`${API}/stub-display`]: () => Response.json(RECORD),
  [`${PACKAGE}/LICENSE`]: () => new Response('Copyright 2017 The Authors\n'),
  [`${PACKAGE}/index.css`]: () => new Response(SHEET),
  [`${PACKAGE}/files/${FILE}`]: () => new Response(face()),
}

const nextFetch = globalThis.fetch

globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input))
  if (!/(^api\.fontsource\.org|^cdn\.jsdelivr\.net)$/.test(url.host)) {
    return nextFetch(input, init)
  }
  return ANSWERS[url.href]?.() ?? new Response('', { status: 404 })
}
