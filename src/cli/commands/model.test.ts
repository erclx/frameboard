import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { cli } from '../../../test/support/cli'
import {
  comfyModelServer,
  FAKE_GLB,
  PNG_BYTES,
} from '../../../test/support/comfyui'
import { polyhaven, rawModel } from '../../../test/support/polyhaven'
import { type TempBoard, writeBoard } from '../../../test/support/temp-board'

describe('model find', () => {
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
    return cli(['model', 'find', ...argv, '--json'], {
      cwd: board.root,
      fetch: send,
    })
  }

  it('lists ranked results crediting Poly Haven and writes no file', async () => {
    const { send } = polyhaven({
      old_stool: rawModel({ download_count: 1 }),
      new_stool: rawModel({ download_count: 50 }),
    })

    const result = await run(send, 'stool')

    expect(result.exitCode).toBe(0)
    expect(result.json().data).toMatchObject({
      version: 1,
      query: 'stool',
      source: { name: 'Poly Haven', url: 'https://polyhaven.com' },
      results: [
        { number: 1, id: 'new_stool' },
        { number: 2, id: 'old_stool' },
      ],
    })
    expect(existsSync(assets)).toBe(false)
  })

  it('answers an empty list at exit 0 when nothing matches', async () => {
    const { send } = polyhaven({ stool: rawModel() })

    const result = await run(send, 'smartphone')

    expect(result.exitCode).toBe(0)
    expect(result.json().data).toMatchObject({ results: [] })
  })

  it('names Poly Haven in the human listing', async () => {
    const { send } = polyhaven({ stool: rawModel() })

    const result = await cli(['model', 'find', 'stool'], {
      cwd: board.root,
      fetch: send,
    })

    expect(result.stdout).toContain('Poly Haven')
  })

  it('saves the numbered result as one .glb at 1k with its license file', async () => {
    const { send, asked } = polyhaven({ wooden_stool_01: rawModel() })

    const result = await run(send, 'stool', '--save', '1')

    expect(result.exitCode).toBe(0)
    expect(result.json().data).toMatchObject({
      project: 'acme',
      path: 'stool.glb',
      licensePath: 'stool.glb.license.json',
    })
    expect(readdirSync(assets).sort()).toEqual([
      'stool.glb',
      'stool.glb.license.json',
    ])
    expect(
      JSON.parse(readFileSync(join(assets, 'stool.glb.license.json'), 'utf8')),
    ).toMatchObject({
      origin: 'found',
      source: 'polyhaven',
      id: 'wooden_stool_01',
      query: 'stool',
      authors: ['Kuutti Siitonen'],
      license: 'cc0',
      landingUrl: 'https://polyhaven.com/a/wooden_stool_01',
      size: '1k',
    })
    expect(asked.some((each) => each.url.pathname.includes('/1k/'))).toBe(true)
  })

  it('saves by Poly Haven id the same file as by number', async () => {
    const byNumber = polyhaven({ wooden_stool_01: rawModel() })
    await run(byNumber.send, 'stool', '--save', '1', '--name', 'a')
    const byId = polyhaven({ wooden_stool_01: rawModel() })

    const result = await run(
      byId.send,
      'stool',
      '--save',
      'wooden_stool_01',
      '--name',
      'b',
    )

    expect(result.exitCode).toBe(0)
    expect(readFileSync(join(assets, 'b.glb'))).toEqual(
      readFileSync(join(assets, 'a.glb')),
    )
    expect(byId.asked.some((each) => each.url.pathname === '/assets')).toBe(
      false,
    )
  })

  it('saves at the size --size names', async () => {
    const { send } = polyhaven({ wooden_stool_01: rawModel() })

    await run(send, 'stool', '--save', '1', '--size', '2k')

    expect(
      JSON.parse(readFileSync(join(assets, 'stool.glb.license.json'), 'utf8')),
    ).toMatchObject({ size: '2k' })
  })

  it('refuses usage naming the sizes offered for one the model lacks, writing nothing', async () => {
    const { send } = polyhaven({ wooden_stool_01: rawModel() })

    const result = await run(send, 'stool', '--save', '1', '--size', '16k')

    expect(result.exitCode).toBe(2)
    expect(result.json().error).toMatchObject({
      code: 'usage',
      details: { sizes: ['1k', '2k'] },
    })
    expect(existsSync(assets)).toBe(false)
  })

  it('refuses usage for a --size Poly Haven never serves', async () => {
    const { send, asked } = polyhaven({ wooden_stool_01: rawModel() })

    const result = await run(send, 'stool', '--save', '1', '--size', '3k')

    expect(result.exitCode).toBe(2)
    expect(result.json().error?.code).toBe('usage')
    expect(asked).toEqual([])
  })

  it('leaves no file when one download of the model fails', async () => {
    const { send } = polyhaven({ wooden_stool_01: rawModel() }, '_diff_1k.jpg')

    const result = await run(send, 'stool', '--save', '1')

    expect(result.exitCode).toBe(13)
    expect(result.json().error?.code).toBe('source-failed')
    expect(existsSync(assets)).toBe(false)
  })

  it('refuses result-not-found at exit 3 for a number past the list', async () => {
    const { send } = polyhaven({ wooden_stool_01: rawModel() })

    const result = await run(send, 'stool', '--save', '9')

    expect(result.exitCode).toBe(3)
    expect(result.json().error?.code).toBe('result-not-found')
  })

  it('refuses project-required before any request on a board of two projects', async () => {
    board.cleanup()
    board = writeBoard({
      'acme/project.json': '{ "version": 1 }\n',
      'beta/project.json': '{ "version": 1 }\n',
    })
    const { send, asked } = polyhaven({ wooden_stool_01: rawModel() })

    const result = await run(send, 'stool', '--save', '1')

    expect(result.json().error?.code).toBe('project-required')
    expect(asked).toEqual([])
  })

  it('refuses usage for --name or --size without --save', async () => {
    const { send } = polyhaven({})

    const named = await run(send, 'stool', '--name', 'hero')
    const sized = await run(send, 'stool', '--size', '2k')

    expect([named.exitCode, sized.exitCode]).toEqual([2, 2])
  })
})

describe('model generate', () => {
  let board: TempBoard
  let assets: string

  beforeEach(() => {
    board = writeBoard({ 'acme/project.json': '{ "version": 1 }\n' })
    assets = join(board.root, 'acme/assets')
    mkdirSync(assets)
    writeFileSync(join(assets, 'axe.png'), PNG_BYTES)
    vi.stubEnv('FRAMEBOARD_COMFYUI_URL', 'http://127.0.0.1:8188')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    board.cleanup()
  })

  function run(send: typeof fetch, ...argv: string[]) {
    return cli(['model', 'generate', ...argv, '--json'], {
      cwd: board.root,
      fetch: send,
    })
  }

  it('saves the GLB with a license naming Pixal3D, the source picture, and the seed', async () => {
    const { send } = comfyModelServer()

    const result = await run(send, 'assets/axe.png')

    expect(result.exitCode).toBe(0)
    expect(result.json().data).toMatchObject({
      provider: 'comfyui',
      model: 'pixal3d-int8-convrot',
      dryRun: false,
      saved: { project: 'acme', path: 'axe.glb' },
    })
    expect(new Uint8Array(readFileSync(join(assets, 'axe.glb')))).toEqual(
      FAKE_GLB,
    )
    expect(
      JSON.parse(readFileSync(join(assets, 'axe.glb.license.json'), 'utf8')),
    ).toMatchObject({
      origin: 'generated',
      kind: 'model',
      provider: 'comfyui',
      server: 'http://127.0.0.1:8188',
      model: 'pixal3d-int8-convrot',
      picture: { path: 'axe.png', inAssets: true, license: null },
      seed: expect.any(Number),
    })
  })

  it('answers the server, model, and picture on a dry run, making no request and writing nothing', async () => {
    const { send, asked } = comfyModelServer()

    const result = await run(send, 'axe.png', '--dry-run')

    expect(result.exitCode).toBe(0)
    expect(result.json().data).toEqual({
      version: 1,
      provider: 'comfyui',
      server: 'http://127.0.0.1:8188',
      model: 'pixal3d-int8-convrot',
      picture: { path: 'axe.png', inAssets: true, license: null },
      dryRun: true,
      saved: null,
    })
    expect(asked).toEqual([])
    expect(readdirSync(assets)).toEqual(['axe.png'])
  })

  it('refuses no-provider at exit 3 naming FRAMEBOARD_COMFYUI_URL while it is unset, making no request', async () => {
    vi.stubEnv('FRAMEBOARD_COMFYUI_URL', '')
    const { send, asked } = comfyModelServer()

    const result = await run(send, 'axe.png')

    expect(result.exitCode).toBe(3)
    expect(result.json().error).toMatchObject({
      code: 'no-provider',
      details: { keys: ['FRAMEBOARD_COMFYUI_URL'] },
    })
    expect(asked).toEqual([])
  })

  it('refuses usage for a workflow holding no {{image}} before any request', async () => {
    const flow = join(board.root, 'flow.json')
    writeFileSync(
      flow,
      JSON.stringify({ '1': { class_type: 'SaveGLB', inputs: {} } }),
    )
    const { send, asked } = comfyModelServer()

    const result = await run(send, 'axe.png', '--workflow', flow)

    expect(result.exitCode).toBe(2)
    expect(result.json().error?.code).toBe('usage')
    expect(asked).toEqual([])
  })
})
