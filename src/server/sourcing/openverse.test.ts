import { describe, expect, it } from 'vitest'

import { imageById, searchImages } from './openverse'

/** One Openverse result as the API spells it. */
function rawImage(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    title: `Photo ${id}`,
    creator: 'Ann',
    creator_url: 'https://example.org/ann',
    license: 'cc0',
    license_version: '1.0',
    license_url: 'https://creativecommons.org/publicdomain/zero/1.0/',
    attribution: `Photo ${id} by Ann is marked with CC0 1.0.`,
    foreign_landing_url: `https://example.org/photos/${id}`,
    url: `https://images.example.org/${id}.jpg`,
    thumbnail: `https://api.openverse.org/v1/images/${id}/thumb/`,
    width: 1024,
    height: 768,
    ...overrides,
  }
}

/** A fake Openverse answering every request with one status and body, recording each URL asked. */
function openverse(status: number, body: unknown) {
  const asked: URL[] = []
  const send = (async (input: string | URL | Request) => {
    asked.push(new URL(input instanceof Request ? input.url : input))
    return new Response(JSON.stringify(body), { status })
  }) as typeof fetch
  return { send, asked }
}

describe('searchImages', () => {
  it('asks for public domain licenses alone by default', async () => {
    const { send, asked } = openverse(200, { results: [] })

    await searchImages('modern house', { credited: false }, send)

    expect(asked[0]?.searchParams.get('license')).toBe('cc0,pdm')
    expect(asked[0]?.searchParams.get('q')).toBe('modern house')
  })

  it('widens to licenses asking for credit under credited', async () => {
    const { send, asked } = openverse(200, { results: [] })

    await searchImages('house', { credited: true }, send)

    expect(asked[0]?.searchParams.get('license')).toBe('cc0,pdm,by')
  })

  it('numbers results from 1 in rank order with camelCase fields', async () => {
    const { send } = openverse(200, {
      results: [rawImage('a'), rawImage('b')],
    })

    const results = await searchImages('house', { credited: false }, send)

    expect(results).toEqual([
      expect.objectContaining({
        number: 1,
        id: 'a',
        creatorUrl: 'https://example.org/ann',
        landingUrl: 'https://example.org/photos/a',
        width: 1024,
      }),
      expect.objectContaining({ number: 2, id: 'b' }),
    ])
  })

  it('skips a result with no URL without leaving a gap in the numbers', async () => {
    const { send } = openverse(200, {
      results: [rawImage('a', { url: null }), rawImage('b')],
    })

    const results = await searchImages('house', { credited: false }, send)

    expect(results.map(({ number, id }) => [number, id])).toEqual([[1, 'b']])
  })

  it('answers an empty list when nothing matches', async () => {
    const { send } = openverse(200, { result_count: 0, results: [] })

    expect(await searchImages('zzz', { credited: false }, send)).toEqual([])
  })

  it('refuses source-failed with the status on a rate limit', async () => {
    const { send } = openverse(429, { detail: 'throttled' })

    await expect(
      searchImages('house', { credited: false }, send),
    ).rejects.toMatchObject({
      code: 'source-failed',
      details: { status: 429 },
    })
  })

  it('refuses source-failed with a null status when the request never lands', async () => {
    const send = (async () => {
      throw new TypeError('fetch failed')
    }) as typeof fetch

    await expect(
      searchImages('house', { credited: false }, send),
    ).rejects.toMatchObject({
      code: 'source-failed',
      details: { status: null },
    })
  })
})

describe('imageById', () => {
  it('fetches the one image at its detail URL', async () => {
    const { send, asked } = openverse(200, rawImage('abc'))

    const image = await imageById('abc', { credited: false }, send)

    expect(asked[0]?.pathname).toBe('/v1/images/abc/')
    expect(image.id).toBe('abc')
  })

  it('refuses result-not-found for an id Openverse does not hold', async () => {
    const { send } = openverse(404, { detail: 'Not found.' })

    await expect(
      imageById('gone', { credited: false }, send),
    ).rejects.toMatchObject({ code: 'result-not-found' })
  })

  it('refuses result-not-found for a credited license without credited', async () => {
    const { send } = openverse(200, rawImage('abc', { license: 'by' }))

    await expect(
      imageById('abc', { credited: false }, send),
    ).rejects.toMatchObject({
      code: 'result-not-found',
      details: { license: 'by' },
    })
  })

  it('takes a credited license under credited', async () => {
    const { send } = openverse(200, rawImage('abc', { license: 'by' }))

    const image = await imageById('abc', { credited: true }, send)

    expect(image.license).toBe('by')
  })
})
