import { describe, expect, it } from 'vitest'

import type { FontCategory } from '@/shared/fonts'
import { version } from '@/shared/version'

import {
  fontsource,
  type RawFamily,
  rawFamily,
  staticFamily,
} from '../../../test/support/fontsource'
import {
  familyById,
  fetchFamilies,
  fetchFont,
  searchFamilies,
} from './fontsource'

describe('fetchFamilies', () => {
  it('asks for the list once, naming Frameboard in the user agent', async () => {
    const { send, asked } = fontsource([rawFamily()])

    await fetchFamilies(send)

    expect(asked.map((each) => [each.url.href, each.userAgent])).toEqual([
      ['https://api.fontsource.org/v1/fonts', `frameboard/${version}`],
    ])
  })

  it('leaves out a family under a license no project installs', async () => {
    const { send } = fontsource([
      rawFamily(),
      staticFamily({ id: 'aileron', license: 'CC0-1.0' }),
    ])

    const families = await fetchFamilies(send)

    expect(families.map((each) => each.id)).toEqual(['lora'])
  })

  it('names the source when it does not answer', async () => {
    const { send } = fontsource([], { failing: '/v1/fonts' })

    await expect(fetchFamilies(send)).rejects.toMatchObject({
      code: 'source-failed',
      details: { source: 'fontsource', status: 500 },
    })
  })

  it.each([
    ['that is no JSON', '<html>'],
    ['that is no list', '{"status":200}'],
  ])('refuses source-failed for an answer %s', async (_case, body) => {
    const send = (async () => new Response(body)) as unknown as typeof fetch

    await expect(fetchFamilies(send)).rejects.toMatchObject({
      code: 'source-failed',
      details: { source: 'fontsource' },
    })
  })
})

describe('searchFamilies', () => {
  const FAMILIES = [
    staticFamily(),
    rawFamily(),
    rawFamily({ id: 'playfair-display', family: 'Playfair Display' }),
    staticFamily({
      id: 'playwrite',
      family: 'Playwrite',
      category: 'handwriting',
    }),
    staticFamily({
      id: 'abril-fatface',
      family: 'Abril Fatface',
      category: 'display',
    }),
  ]

  async function search(
    query: string | null,
    category: FontCategory | null = null,
    families: RawFamily[] = FAMILIES,
  ) {
    const { send } = fontsource(families)
    return searchFamilies(await fetchFamilies(send), { query, category })
  }

  it('answers a family with its license and category', async () => {
    const { results } = await search('lora')

    expect(results).toEqual([
      {
        number: 1,
        id: 'lora',
        family: 'Lora',
        category: 'serif',
        license: 'OFL-1.1',
        variable: true,
        weights: [400, 500, 600, 700],
        styles: ['italic', 'normal'],
        subsets: [
          'cyrillic',
          'cyrillic-ext',
          'latin',
          'latin-ext',
          'math',
          'symbols',
          'vietnamese',
        ],
        landingUrl: 'https://fontsource.org/fonts/lora',
        sample:
          'https://cdn.jsdelivr.net/fontsource/fonts/lora@latest/latin-400-normal.woff2',
      },
    ])
  })

  it('samples a weight and style the family has', async () => {
    const { results } = await search('molle', null, [
      staticFamily({
        id: 'molle',
        family: 'Molle',
        weights: [300],
        styles: ['italic'],
      }),
    ])

    expect(results[0]?.sample).toBe(
      'https://cdn.jsdelivr.net/fontsource/fonts/molle@latest/latin-300-italic.woff2',
    )
  })

  it.each([
    ['a word opening a name', 'play', ['playfair-display', 'playwrite']],
    ['every word of a name, in any case', 'DISPLAY pl', ['playfair-display']],
    [
      'a name ahead of a category',
      'display',
      ['playfair-display', 'abril-fatface'],
    ],
    ['a category', 'serif', ['lora', 'playfair-display']],
    ['nothing', 'zzz', []],
  ])('matches %s', async (_case, query, ids) => {
    const { results } = await search(query)

    expect(results.map((each) => each.id)).toEqual(ids)
  })

  it('puts an exact name first, then one the query opens', async () => {
    const { results } = await search('inter', null, [
      staticFamily({ id: 'a-inter', family: 'A Inter' }),
      staticFamily({ id: 'inter-tight', family: 'Inter Tight' }),
      staticFamily({ id: 'inter', family: 'Inter' }),
    ])

    expect(results.map((each) => each.id)).toEqual([
      'inter',
      'inter-tight',
      'a-inter',
    ])
  })

  it.each([
    ['the query and', 'play', ['playfair-display']],
    ['no query but', null, ['lora', 'playfair-display']],
  ])('keeps %s the category asked for', async (_case, query, ids) => {
    const { results } = await search(query, 'serif')

    expect(results.map((each) => each.id)).toEqual(ids)
  })

  it('lists 20 and counts every match', async () => {
    const many = Array.from({ length: 25 }, (_, index) =>
      staticFamily({ id: `noto-${index}`, family: `Noto ${index}` }),
    )

    const { results, total } = await search('noto', null, many)

    expect(total).toBe(25)
    expect(results.map((each) => each.number)).toEqual(
      Array.from({ length: 20 }, (_, index) => index + 1),
    )
  })
})

describe('familyById', () => {
  it.each([
    ['an id Fontsource does not hold', 'nope'],
    ['an id that is a path', '../lora'],
  ])('refuses result-not-found for %s', async (_case, id) => {
    const { send } = fontsource([rawFamily()])

    await expect(familyById(id, send)).rejects.toMatchObject({
      code: 'result-not-found',
    })
  })

  it('refuses license-refused for a family under another license', async () => {
    const { send } = fontsource([
      staticFamily({ id: 'aileron', license: 'CC0-1.0' }),
    ])

    await expect(familyById('aileron', send)).rejects.toMatchObject({
      code: 'license-refused',
      details: { id: 'aileron', license: 'CC0-1.0' },
    })
  })
})

describe('fetchFont', () => {
  async function fetched(raw: RawFamily, weights?: number[]) {
    const { send, asked } = fontsource([raw])
    const family = await familyById(raw.id, send)
    return { font: await fetchFont(family, weights, send), asked }
  }

  it('holds every subset and style of a variable family at its full weights', async () => {
    const { font } = await fetched(rawFamily())

    expect(font.faces).toHaveLength(14)
    expect(font.faces[0]).toEqual({
      file: 'lora-cyrillic-wght-normal.woff2',
      style: 'normal',
      weights: { min: 400, max: 700 },
      unicodeRange: 'U+0460-052F',
    })
    expect([...font.files.keys()].sort()).toEqual(
      font.faces.map((face) => face.file).sort(),
    )
  })

  it('holds each file as the source serves it', async () => {
    const { font } = await fetched(rawFamily())

    expect(
      new TextDecoder().decode(font.files.get('lora-latin-wght-normal.woff2')),
    ).toBe('lora-latin-wght-normal.woff2')
  })

  it("holds the source's license text and the release it came from", async () => {
    const { font } = await fetched(rawFamily())

    expect(new TextDecoder().decode(font.licenseText)).toContain(
      'Copyright 2011 The Lora Project Authors',
    )
    expect(font.url).toBe(
      'https://cdn.jsdelivr.net/npm/@fontsource-variable/lora@5.3.0/',
    )
  })

  it.each([
    [
      '400 and 700 of a static family, in both styles',
      staticFamily(),
      undefined,
      ['400 normal', '400 italic', '700 normal', '700 italic'],
    ],
    [
      'the weights asked for in place of 400 and 700',
      staticFamily({ styles: ['normal'] }),
      [300, 900],
      ['300 normal', '900 normal'],
    ],
    [
      'every weight of a family with neither 400 nor 700',
      staticFamily({ weights: [300], styles: ['normal'] }),
      undefined,
      ['300 normal'],
    ],
    [
      'an italic-only family',
      staticFamily({ weights: [400], styles: ['italic'] }),
      undefined,
      ['400 italic'],
    ],
  ])('holds %s', async (_case, raw, weights, held) => {
    const { font } = await fetched(raw, weights)

    expect([
      ...new Set(font.faces.map((face) => `${face.weights.max} ${face.style}`)),
    ]).toEqual(held)
  })

  it('takes no WOFF beside the WOFF2', async () => {
    const { asked } = await fetched(staticFamily())

    expect(asked.some((each) => each.url.pathname.endsWith('.woff2'))).toBe(
      true,
    )
    expect(asked.some((each) => each.url.pathname.endsWith('.woff'))).toBe(
      false,
    )
  })

  it.each([
    ['a weight a static family lacks', staticFamily(), [550]],
    ['any weight of a variable family', rawFamily(), [400]],
  ])('refuses usage for %s', async (_case, raw, weights) => {
    await expect(fetched(raw, weights)).rejects.toMatchObject({ code: 'usage' })
  })

  it('refuses source-failed when one of seven subsets fails', async () => {
    const { send } = fontsource([rawFamily()], { failing: 'symbols-wght' })
    const family = await familyById('lora', send)

    await expect(fetchFont(family, undefined, send)).rejects.toMatchObject({
      code: 'source-failed',
      details: { source: 'fontsource', status: 500 },
    })
  })

  it.each([
    [
      'naming no file',
      '@font-face { font-style: normal; font-weight: 400; src: local(Lora) }',
    ],
    [
      'naming a file outside its folder',
      '@font-face { font-style: normal; font-weight: 400; src: url(./files/../x.woff2) }',
    ],
    ['holding no face', 'body { color: red }'],
    ['that does not parse', '@font-face {'],
  ])('refuses source-failed for a sheet %s', async (_case, css) => {
    const { send } = fontsource([rawFamily()])
    const family = await familyById('lora', send)
    const sheets = (async (input: string | URL | Request) =>
      String(input).endsWith('.css')
        ? new Response(css)
        : send(input)) as typeof fetch

    await expect(fetchFont(family, undefined, sheets)).rejects.toMatchObject({
      code: 'source-failed',
      details: { source: 'fontsource' },
    })
  })
})
