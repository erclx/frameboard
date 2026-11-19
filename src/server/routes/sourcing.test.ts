import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../../test/support/fixture-board'
import { polyhaven, rawModel } from '../../../test/support/polyhaven'
import { sourcingRoutes, type SourcingRoutesOptions } from './sourcing'

const TOKEN = 'a'.repeat(64)
const FAL_KEY = 'fal-secret-key-0123456789'
const WRITER = { authorization: `Bearer ${TOKEN}` }

/** A 1 by 1 PNG, small enough to inline and real enough to decode. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

/** One Openverse result as the API spells it. */
function rawImage(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    title: `Photo ${id}`,
    creator: 'Ann',
    creator_url: null,
    license: 'cc0',
    license_version: '1.0',
    license_url: 'https://creativecommons.org/publicdomain/zero/1.0/',
    attribution: `Photo ${id} by Ann is marked with CC0 1.0.`,
    foreign_landing_url: `https://www.flickr.com/photos/${id}`,
    url: `https://images.example.org/${id}.png`,
    thumbnail: `https://api.openverse.org/v1/images/${id}/thumb/`,
    width: 1024,
    height: 768,
    ...overrides,
  }
}

interface FakeSource {
  send: typeof fetch
  /** Every URL asked, in order. */
  asked: URL[]
}

/**
 * A fake network: Openverse answers `search` for a search and the matching
 * image by id, image hosts answer the PNG, and fal answers `fal`.
 */
function fakeSource({
  search = { status: 200, body: { results: [rawImage('a1'), rawImage('b2')] } },
  fal = () =>
    Response.json({
      images: [{ url: `data:image/png;base64,${PNG.toString('base64')}` }],
    }),
  images = [rawImage('a1'), rawImage('b2'), rawImage('c3', { license: 'by' })],
}: {
  search?: { status: number; body: unknown }
  fal?: (init?: RequestInit) => Response | Promise<Response>
  images?: ReturnType<typeof rawImage>[]
} = {}): FakeSource {
  const asked: URL[] = []
  const send = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input)
    asked.push(url)
    if (url.host === 'fal.run') return fal(init)
    if (url.host === 'images.example.org') {
      return new Response(PNG, { headers: { 'content-type': 'image/png' } })
    }
    const byId = /\/v1\/images\/([^/]+)\/$/.exec(url.pathname)?.[1]
    if (byId !== undefined) {
      const image = images.find((each) => each.id === byId)
      return image ? Response.json(image) : new Response('{}', { status: 404 })
    }
    return Response.json(search.body, { status: search.status })
  }) as typeof fetch
  return { send, asked }
}

describe('sourcingRoutes', () => {
  let board: FixtureBoard

  beforeEach(() => {
    board = copyFixtureBoard('basic')
  })

  afterEach(() => {
    board.cleanup()
  })

  function routes(options: SourcingRoutesOptions = {}) {
    return sourcingRoutes(
      board.root,
      {
        token: () => TOKEN,
        key: 'b'.repeat(64),
        cookieName: 'frameboard-key-111111111111',
        isOwnOrigin: () => false,
      },
      { env: {}, ...options },
    )
  }

  function assetFiles(): string[] {
    const folder = join(board.root, 'webapp/assets')
    return existsSync(folder) ? readdirSync(folder).sort() : []
  }

  function post(body: unknown, headers: HeadersInit = WRITER) {
    return {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }
  }

  describe('GET find', () => {
    it('answers numbered results under the public domain licenses, for a reader too', async () => {
      const { send } = fakeSource()

      const response = await routes({ send }).request(
        '/api/projects/webapp/sourcing/find?q=modern%20house',
      )

      expect(response.status).toBe(200)
      const { data } = await response.json()
      expect(data.query).toBe('modern house')
      expect(data.licenses).toEqual(['cc0', 'pdm'])
      expect(data.results.map((each: { id: string }) => each.id)).toEqual([
        'a1',
        'b2',
      ])
    })

    it('widens the search to credited licenses when asked', async () => {
      const { send, asked } = fakeSource()

      await routes({ send }).request(
        '/api/projects/webapp/sourcing/find?q=house&credited=true',
      )

      expect(asked[0]?.searchParams.get('license')).toBe('cc0,pdm,by')
    })

    it('refuses an empty query as usage without asking Openverse', async () => {
      const { send, asked } = fakeSource()

      const response = await routes({ send }).request(
        '/api/projects/webapp/sourcing/find?q=%20%20',
      )

      expect(response.status).toBe(400)
      expect((await response.json()).error.code).toBe('usage')
      expect(asked).toEqual([])
    })

    it('answers source-failed with the status Openverse refused with', async () => {
      const { send } = fakeSource({ search: { status: 429, body: {} } })

      const response = await routes({ send }).request(
        '/api/projects/webapp/sourcing/find?q=house',
      )

      expect(response.status).toBe(502)
      const { error } = await response.json()
      expect(error.code).toBe('source-failed')
      expect(error.details.status).toBe(429)
    })

    it('refuses a project the board does not hold', async () => {
      const response = await routes({ send: fakeSource().send }).request(
        '/api/projects/nowhere/sourcing/find?q=house',
      )

      expect(response.status).toBe(404)
      expect((await response.json()).error.code).toBe('project-not-found')
    })
  })

  describe('POST save', () => {
    it('refuses a reader with 401 and writes nothing', async () => {
      const { send, asked } = fakeSource()

      const response = await routes({ send }).request(
        '/api/projects/webapp/sourcing/save',
        post({ id: 'a1', query: 'modern house' }, {}),
      )

      expect(response.status).toBe(401)
      expect(asked).toEqual([])
      expect(assetFiles()).toEqual([])
    })

    it("saves the image under the query's name with the license Openverse holds", async () => {
      const { send } = fakeSource()

      const response = await routes({ send }).request(
        '/api/projects/webapp/sourcing/save',
        post({ id: 'a1', query: 'Modern House' }),
      )

      expect(response.status).toBe(200)
      const { data } = await response.json()
      expect(data.path).toBe('modern-house.png')
      expect(assetFiles()).toEqual([
        'modern-house.png',
        'modern-house.png.license.json',
      ])
      const license = JSON.parse(
        readFileSync(
          join(board.root, 'webapp/assets/modern-house.png.license.json'),
          'utf8',
        ),
      )
      expect(license).toMatchObject({
        origin: 'found',
        id: 'a1',
        query: 'Modern House',
        attribution: 'Photo a1 by Ann is marked with CC0 1.0.',
      })
    })

    it('lands one file for two saves of one result sent together', async () => {
      const { send } = fakeSource()
      const app = routes({ send })

      const [first, second] = await Promise.all([
        app.request(
          '/api/projects/webapp/sourcing/save',
          post({ id: 'a1', query: 'house' }),
        ),
        app.request(
          '/api/projects/webapp/sourcing/save',
          post({ id: 'a1', query: 'house' }),
        ),
      ])

      expect([first.status, second.status]).toEqual([200, 200])
      expect(assetFiles()).toEqual(['house.png', 'house.png.license.json'])
    })

    it('refuses a credited result when the save did not allow credited licenses', async () => {
      const { send } = fakeSource()

      const response = await routes({ send }).request(
        '/api/projects/webapp/sourcing/save',
        post({ id: 'c3', query: 'house' }),
      )

      expect(response.status).toBe(404)
      expect((await response.json()).error.code).toBe('result-not-found')
      expect(assetFiles()).toEqual([])
    })
  })

  describe('GET models', () => {
    it('answers Poly Haven models matching the query, naming Poly Haven, for a reader too', async () => {
      const { send } = polyhaven({
        wooden_stool_01: rawModel(),
        office_chair: rawModel({ name: 'Office Chair', tags: ['chair'] }),
      })

      const response = await routes({ send }).request(
        '/api/projects/webapp/sourcing/models?q=chair',
      )

      expect(response.status).toBe(200)
      const { data } = await response.json()
      expect(data.query).toBe('chair')
      expect(data.source).toEqual({
        name: 'Poly Haven',
        url: 'https://polyhaven.com',
      })
      expect(data.results.map((each: { id: string }) => each.id)).toEqual([
        'office_chair',
      ])
      expect(data.results[0].polycount).toBe(10946)
    })

    it('refuses an empty query as usage without asking Poly Haven', async () => {
      const { send, asked } = polyhaven({})

      const response = await routes({ send }).request(
        '/api/projects/webapp/sourcing/models?q=',
      )

      expect(response.status).toBe(400)
      expect((await response.json()).error.code).toBe('usage')
      expect(asked).toEqual([])
    })
  })

  describe('POST models/save', () => {
    it('refuses a reader with 401 and writes nothing', async () => {
      const { send, asked } = polyhaven({ wooden_stool_01: rawModel() })

      const response = await routes({ send }).request(
        '/api/projects/webapp/sourcing/models/save',
        post({ id: 'wooden_stool_01', query: 'stool' }, {}),
      )

      expect(response.status).toBe(401)
      expect(asked).toEqual([])
      expect(assetFiles()).toEqual([])
    })

    it("saves a 1k GLB under the query's name with a CC0 license from Poly Haven", async () => {
      const { send } = polyhaven({ wooden_stool_01: rawModel() })

      const response = await routes({ send }).request(
        '/api/projects/webapp/sourcing/models/save',
        post({ id: 'wooden_stool_01', query: 'Wooden Stool' }),
      )

      expect(response.status).toBe(200)
      const { data } = await response.json()
      expect(data.path).toBe('wooden-stool.glb')
      expect(assetFiles()).toEqual([
        'wooden-stool.glb',
        'wooden-stool.glb.license.json',
      ])
      const license = JSON.parse(
        readFileSync(
          join(board.root, 'webapp/assets/wooden-stool.glb.license.json'),
          'utf8',
        ),
      )
      expect(license).toMatchObject({
        source: 'polyhaven',
        id: 'wooden_stool_01',
        query: 'Wooden Stool',
        license: 'cc0',
        size: '1k',
      })
    })

    it('lands one file for two saves of one model sent together', async () => {
      const { send } = polyhaven({ wooden_stool_01: rawModel() })
      const app = routes({ send })
      const save = () =>
        app.request(
          '/api/projects/webapp/sourcing/models/save',
          post({ id: 'wooden_stool_01', query: 'stool' }),
        )

      const [first, second] = await Promise.all([save(), save()])

      expect([first.status, second.status]).toEqual([200, 200])
      expect(assetFiles()).toEqual(['stool.glb', 'stool.glb.license.json'])
    })

    it('refuses an id Poly Haven holds no model under, writing nothing', async () => {
      const { send } = polyhaven({})

      const response = await routes({ send }).request(
        '/api/projects/webapp/sourcing/models/save',
        post({ id: 'nothing_here', query: 'stool' }),
      )

      expect(response.status).toBe(404)
      expect((await response.json()).error.code).toBe('result-not-found')
      expect(assetFiles()).toEqual([])
    })
  })

  describe('GET provider', () => {
    it('names the ready provider, its key variable, and its price, never the key', async () => {
      const response = await routes({ env: { FAL_KEY } }).request(
        '/api/projects/webapp/sourcing/provider',
      )

      const text = await response.text()
      expect(text).not.toContain(FAL_KEY)
      expect(JSON.parse(text).data).toEqual({
        version: 1,
        enabled: false,
        provider: {
          name: 'fal',
          model: 'fal-ai/flux/schnell',
          key: 'FAL_KEY',
          width: 1024,
          height: 1024,
          priceUsd: 0.0032,
        },
        keys: ['FRAMEBOARD_COMFYUI_URL', 'FAL_KEY', 'GEMINI_API_KEY'],
      })
    })

    it('answers no provider with every key to set when none is', async () => {
      const response = await routes().request(
        '/api/projects/webapp/sourcing/provider',
      )

      const { data } = await response.json()
      expect(data.provider).toBeNull()
      expect(data.keys).toEqual([
        'FRAMEBOARD_COMFYUI_URL',
        'FAL_KEY',
        'GEMINI_API_KEY',
      ])
    })
  })

  describe('POST generate', () => {
    it('is off unless the server switches it on, spending nothing', async () => {
      const { send, asked } = fakeSource()

      const response = await routes({ send, env: { FAL_KEY } }).request(
        '/api/projects/webapp/sourcing/generate',
        post({ prompt: 'a house at dusk' }),
      )

      expect(response.status).toBe(403)
      expect((await response.json()).error.code).toBe('generate-off')
      expect(asked).toEqual([])
    })

    it('refuses a reader with 401 even when switched on', async () => {
      const { send, asked } = fakeSource()

      const response = await routes({
        send,
        env: { FAL_KEY },
        generate: true,
      }).request(
        '/api/projects/webapp/sourcing/generate',
        post({ prompt: 'a house at dusk' }, {}),
      )

      expect(response.status).toBe(401)
      expect(asked).toEqual([])
    })

    it('saves the generated image with its license, the key absent from the answer', async () => {
      const { send } = fakeSource()

      const response = await routes({
        send,
        env: { FAL_KEY },
        generate: true,
      }).request(
        '/api/projects/webapp/sourcing/generate',
        post({ prompt: 'a house at dusk' }),
      )

      const text = await response.text()
      expect(response.status).toBe(200)
      expect(text).not.toContain(FAL_KEY)
      expect(JSON.parse(text).data.saved.path).toBe('a-house-at-dusk.png')
      expect(assetFiles()).toEqual([
        'a-house-at-dusk.png',
        'a-house-at-dusk.png.license.json',
      ])
    })

    it('keeps the key out of a refusal that echoes it', async () => {
      const { send } = fakeSource({
        fal: () =>
          Response.json(
            { detail: `Key ${FAL_KEY} has no balance` },
            { status: 402 },
          ),
      })

      const response = await routes({
        send,
        env: { FAL_KEY },
        generate: true,
      }).request(
        '/api/projects/webapp/sourcing/generate',
        post({ prompt: 'a house' }),
      )

      const text = await response.text()
      expect(response.status).toBe(502)
      expect(JSON.parse(text).error.code).toBe('provider-failed')
      expect(text).not.toContain(FAL_KEY)
    })

    it('refuses no-provider when no key is set, sending nothing', async () => {
      const { send, asked } = fakeSource()

      const response = await routes({ send, generate: true }).request(
        '/api/projects/webapp/sourcing/generate',
        post({ prompt: 'a house' }),
      )

      expect(response.status).toBe(409)
      expect((await response.json()).error.code).toBe('no-provider')
      expect(asked).toEqual([])
    })

    it('runs one generation at a time, refusing a second sent while the first runs', async () => {
      let release = () => {}
      const held = new Promise<void>((done) => {
        release = done
      })
      const { send, asked } = fakeSource({
        fal: async () => {
          await held
          return Response.json({
            images: [
              { url: `data:image/png;base64,${PNG.toString('base64')}` },
            ],
          })
        },
      })
      const app = routes({ send, env: { FAL_KEY }, generate: true })

      const first = app.request(
        '/api/projects/webapp/sourcing/generate',
        post({ prompt: 'a house' }),
      )
      const second = await app.request(
        '/api/projects/webapp/sourcing/generate',
        post({ prompt: 'a house' }),
      )
      release()

      expect(second.status).toBe(429)
      expect((await first).status).toBe(200)
      expect(asked.filter((url) => url.host === 'fal.run')).toHaveLength(1)
    })

    it('still saves the image when the tab that asked goes away mid-run', async () => {
      const tab = new AbortController()
      const { send } = fakeSource({
        // A request carrying the tab's signal fails here, as a real one would once the tab goes.
        fal: (init) => {
          tab.abort()
          if (init?.signal?.aborted)
            throw new DOMException('gone', 'AbortError')
          return Response.json({
            images: [
              { url: `data:image/png;base64,${PNG.toString('base64')}` },
            ],
          })
        },
      })

      const app = routes({ send, env: { FAL_KEY }, generate: true })
      await Promise.resolve(
        app.request(
          new Request(
            'http://localhost/api/projects/webapp/sourcing/generate',
            {
              ...post({ prompt: 'a house' }),
              signal: tab.signal,
            },
          ),
        ),
      ).catch(() => null)

      expect(assetFiles()).toEqual(['a-house.png', 'a-house.png.license.json'])
    })
  })
})
