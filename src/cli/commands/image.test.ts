import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { cli } from '../../../test/support/cli'
import { type TempBoard, writeBoard } from '../../../test/support/temp-board'

/** One Openverse result as the API spells it. */
function rawImage(id: string) {
  return {
    id,
    title: `Photo ${id}`,
    creator: 'Ann',
    license: 'cc0',
    license_version: '1.0',
    license_url: 'https://creativecommons.org/publicdomain/zero/1.0/',
    attribution: `Photo ${id} by Ann is marked with CC0 1.0.`,
    url: `https://images.example.org/${id}.jpg`,
  }
}

/**
 * A fake network holding Openverse and one image host: a search answers the
 * given results, a detail URL the image with that id, and an image URL its
 * bytes. Every URL asked is recorded.
 */
function network(results: unknown[]) {
  const asked: string[] = []
  const send = (async (input: string | URL | Request) => {
    const url = new URL(input instanceof Request ? input.url : input)
    asked.push(url.href)
    if (url.host === 'images.example.org') {
      return new Response(new Uint8Array([7, 7, 7]), {
        headers: { 'content-type': 'image/jpeg' },
      })
    }
    const detail = /^\/v1\/images\/([^/]+)\/$/.exec(url.pathname)
    if (detail) return Response.json(rawImage(detail[1] ?? ''))
    return Response.json({ results })
  }) as typeof fetch
  return { send, asked }
}

describe('image find', () => {
  let board: TempBoard
  let assets: string

  beforeEach(() => {
    board = writeBoard({ 'acme/project.json': '{ "version": 1 }\n' })
    assets = join(board.root, 'acme/assets')
  })

  afterEach(() => {
    board.cleanup()
  })

  function run(send: typeof fetch, ...argv: string[]) {
    return cli(['image', 'find', ...argv, '--json'], {
      cwd: board.root,
      fetch: send,
    })
  }

  it('lists the results and writes no file', async () => {
    const { send } = network([rawImage('a'), rawImage('b')])

    const result = await run(send, 'modern house')

    expect(result.exitCode).toBe(0)
    expect(result.json().data).toMatchObject({
      version: 1,
      query: 'modern house',
      licenses: ['cc0', 'pdm'],
      results: [
        { number: 1, id: 'a' },
        { number: 2, id: 'b' },
      ],
    })
    expect(existsSync(assets)).toBe(false)
  })

  it('answers an empty list at exit 0 when nothing matches', async () => {
    const { send } = network([])

    const result = await run(send, 'zzz')

    expect(result.exitCode).toBe(0)
    expect(result.json().data).toMatchObject({ results: [] })
  })

  it('saves the numbered result and its license file under the query', async () => {
    const { send } = network([rawImage('a'), rawImage('b')])

    const result = await run(send, 'modern house', '--save', '2')

    expect(result.exitCode).toBe(0)
    expect(result.json().data).toMatchObject({
      project: 'acme',
      path: 'modern-house.jpg',
      licensePath: 'modern-house.jpg.license.json',
    })
    expect([...readFileSync(join(assets, 'modern-house.jpg'))]).toEqual([
      7, 7, 7,
    ])
    expect(
      JSON.parse(
        readFileSync(join(assets, 'modern-house.jpg.license.json'), 'utf8'),
      ),
    ).toMatchObject({
      origin: 'found',
      id: 'b',
      query: 'modern house',
      license: 'cc0',
    })
  })

  it('saves by id under --name with no search', async () => {
    const { send, asked } = network([])

    const result = await run(
      send,
      'house',
      '--save',
      'abc-123',
      '--name',
      'hero',
    )

    expect(result.exitCode).toBe(0)
    expect(readdirSync(assets).sort()).toEqual([
      'hero.jpg',
      'hero.jpg.license.json',
    ])
    expect(asked.some((url) => url.includes('?'))).toBe(false)
  })

  it('refuses result-not-found at exit 3 for a number past the list, writing nothing', async () => {
    const { send } = network([rawImage('a')])

    const result = await run(send, 'house', '--save', '9')

    expect(result.exitCode).toBe(3)
    expect(result.json().error?.code).toBe('result-not-found')
    expect(existsSync(assets)).toBe(false)
  })

  it('refuses project-required before any request on a board of two projects', async () => {
    board.cleanup()
    board = writeBoard({
      'acme/project.json': '{ "version": 1 }\n',
      'beta/project.json': '{ "version": 1 }\n',
    })
    const { send, asked } = network([rawImage('a')])

    const result = await run(send, 'house', '--save', '1')

    expect(result.json().error?.code).toBe('project-required')
    expect(asked).toEqual([])
  })

  it('refuses usage for --name without --save', async () => {
    const { send } = network([])

    const result = await run(send, 'house', '--name', 'hero')

    expect(result.exitCode).toBe(2)
    expect(result.json().error?.code).toBe('usage')
  })
})

describe('image generate', () => {
  let board: TempBoard
  let assets: string

  beforeEach(() => {
    board = writeBoard({ 'acme/project.json': '{ "version": 1 }\n' })
    assets = join(board.root, 'acme/assets')
    vi.stubEnv('FAL_KEY', '')
    vi.stubEnv('GEMINI_API_KEY', '')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    board.cleanup()
  })

  /** A fake fal answering one status and body, recording each URL asked. */
  function fal(status: number, body: unknown) {
    const asked: string[] = []
    const send = (async (input: string | URL | Request) => {
      asked.push(String(input))
      return Response.json(body, { status })
    }) as typeof fetch
    return { send, asked }
  }

  function run(send: typeof fetch, ...argv: string[]) {
    return cli(['image', 'generate', ...argv, '--json'], {
      cwd: board.root,
      fetch: send,
    })
  }

  it('answers the provider and price on a dry run and makes no request', async () => {
    vi.stubEnv('FAL_KEY', 'fal-secret')
    const { send, asked } = fal(200, {})

    const result = await run(send, 'a modern house', '--dry-run')

    expect(result.exitCode).toBe(0)
    expect(result.json().data).toEqual({
      version: 1,
      provider: 'fal',
      model: 'fal-ai/flux/schnell',
      prompt: 'a modern house',
      width: 1024,
      height: 1024,
      priceUsd: 0.0032,
      dryRun: true,
      saved: null,
    })
    expect(asked).toEqual([])
    expect(result.stdout).not.toContain('fal-secret')
  })

  it('refuses no-provider at exit 3 with no key set', async () => {
    const { send, asked } = fal(200, {})

    const result = await run(send, 'a modern house')

    expect(result.exitCode).toBe(3)
    expect(result.json().error?.code).toBe('no-provider')
    expect(asked).toEqual([])
  })

  it('saves the generated image and a license file naming the prompt', async () => {
    vi.stubEnv('FAL_KEY', 'fal-secret')
    const { send } = fal(200, {
      images: [{ url: 'data:image/jpeg;base64,AQID' }],
    })

    const result = await run(send, 'A modern house', '--width', '800')

    expect(result.exitCode).toBe(0)
    expect(result.json().data).toMatchObject({
      dryRun: false,
      saved: { path: 'a-modern-house.jpg' },
    })
    expect(
      JSON.parse(
        readFileSync(join(assets, 'a-modern-house.jpg.license.json'), 'utf8'),
      ),
    ).toMatchObject({
      origin: 'generated',
      provider: 'fal',
      prompt: 'A modern house',
      width: 800,
      height: 1024,
    })
  })

  it('answers one provider-failed envelope with the status and no key', async () => {
    vi.stubEnv('FAL_KEY', 'fal-secret')
    const { send } = fal(403, { detail: 'Balance exhausted for fal-secret' })

    const result = await run(send, 'a modern house')

    expect(result.exitCode).toBe(13)
    expect(result.json().error).toMatchObject({
      code: 'provider-failed',
      details: { provider: 'fal', status: 403 },
    })
    expect(result.stdout).not.toContain('fal-secret')
    expect(existsSync(assets)).toBe(false)
  })
})
