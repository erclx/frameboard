import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  comfyModelServer,
  FAKE_GLB,
  PNG_BYTES,
} from '../../../test/support/comfyui'
import { type TempBoard, writeBoard } from '../../../test/support/temp-board'
import {
  generateModel,
  planModelGeneration,
  readPicture,
} from './generate-model'

const env = { FRAMEBOARD_COMFYUI_URL: 'http://127.0.0.1:8188' }

describe('readPicture', () => {
  let board: TempBoard
  let project: { path: string }

  beforeEach(() => {
    board = writeBoard({ 'acme/project.json': '{ "version": 1 }\n' })
    project = { path: join(board.root, 'acme') }
    mkdirSync(join(project.path, 'assets'))
  })

  afterEach(() => {
    board.cleanup()
  })

  it('reads a project asset by its assets/ path and carries its license forward', async () => {
    writeFileSync(join(project.path, 'assets/axe.png'), PNG_BYTES)
    writeFileSync(
      join(project.path, 'assets/axe.png.license.json'),
      JSON.stringify({
        version: 1,
        origin: 'found',
        source: 'openverse',
        id: 'o1',
        query: 'axe',
        title: null,
        creator: null,
        creatorUrl: null,
        license: 'by',
        licenseVersion: '4.0',
        licenseUrl: null,
        attribution: null,
        landingUrl: null,
        url: 'https://example.com/axe.png',
        savedAt: '2026-11-19T00:00:00.000Z',
      }),
    )

    const picture = await readPicture('assets/axe.png', board.root, project)

    expect(picture.source).toEqual({
      path: 'axe.png',
      inAssets: true,
      license: { origin: 'found', license: 'by' },
    })
  })

  it('names a picture outside the project by its file name alone', async () => {
    const outside = join(board.root, '..', 'shots')
    mkdirSync(outside)
    writeFileSync(join(outside, 'axe.png'), PNG_BYTES)

    const picture = await readPicture('../shots/axe.png', board.root, project)

    expect(picture.source).toEqual({
      path: 'axe.png',
      inAssets: false,
      license: null,
    })
  })

  it('refuses usage for a file named .png that holds no picture', async () => {
    writeFileSync(join(project.path, 'assets/notes.png'), 'just text')

    await expect(
      readPicture('notes.png', board.root, project),
    ).rejects.toMatchObject({ code: 'usage' })
  })

  it('refuses usage for a path naming no file', async () => {
    await expect(
      readPicture('missing.png', board.root, project),
    ).rejects.toMatchObject({
      code: 'usage',
      details: { picture: 'missing.png' },
    })
  })
})

const picture = {
  bytes: PNG_BYTES,
  name: 'axe.png',
  source: { path: 'axe.png', inAssets: false, license: null },
}

describe('planModelGeneration', () => {
  it('refuses no-provider naming FRAMEBOARD_COMFYUI_URL while it is unset', () => {
    expect(() =>
      planModelGeneration({ picture }, { FRAMEBOARD_COMFYUI_URL: ' ' }),
    ).toThrow(
      expect.objectContaining({
        code: 'no-provider',
        details: { keys: ['FRAMEBOARD_COMFYUI_URL'] },
      }),
    )
  })

  it('names the workflow file as the model when one is run', () => {
    const plan = planModelGeneration(
      {
        picture,
        workflow: { name: 'flows/trellis2.json', graph: {} },
      },
      env,
    )

    expect(plan.model).toBe('trellis2.json')
  })
})

describe('generateModel', () => {
  it('uploads the picture, runs the bundled workflow on the stored name, and answers the GLB', async () => {
    const { send, asked, prompts } = comfyModelServer({
      stored: 'axe (1).png',
    })
    const plan = planModelGeneration({ picture }, env, () => 0.5)

    const glb = await generateModel(plan, send)

    expect(glb).toEqual(FAKE_GLB)
    expect(asked).toEqual([
      'POST /upload/image',
      'POST /prompt',
      'GET /history/p1',
      'GET /view',
    ])
    const sent = JSON.stringify(prompts[0])
    expect(sent).toContain('"image":"axe (1).png"')
    expect(sent).not.toContain('{{')
  })

  it('refuses provider-failed naming the node a run failed in', async () => {
    const { send } = comfyModelServer({
      history: {
        status: {
          status_str: 'error',
          completed: false,
          messages: [
            [
              'execution_error',
              {
                node_id: '319',
                node_type: 'UNETLoader',
                exception_message: 'pixal3d_int8_convrot.safetensors not found',
              },
            ],
          ],
        },
        outputs: {},
      },
    })
    const plan = planModelGeneration({ picture }, env)

    await expect(generateModel(plan, send)).rejects.toMatchObject({
      code: 'provider-failed',
      details: { provider: 'comfyui', node: '319' },
    })
  })
})
