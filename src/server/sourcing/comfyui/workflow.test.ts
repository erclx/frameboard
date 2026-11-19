import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  BUNDLED_MODEL_WORKFLOW,
  BUNDLED_WORKFLOW,
  checkWorkflow,
  fillWorkflow,
  readWorkflow,
} from './workflow'

const values = {
  prompt: 'a "quoted" phone',
  width: 768,
  height: 512,
  seed: 9007199254740991,
}

describe('fillWorkflow', () => {
  it('fills a whole-string placeholder for a number with a typed number', () => {
    const filled = fillWorkflow(
      {
        '1': {
          class_type: 'EmptyLatentImage',
          inputs: { width: '{{width}}', height: '{{height}}' },
        },
        '2': { class_type: 'RandomNoise', inputs: { noise_seed: '{{seed}}' } },
      },
      values,
    )

    expect(filled).toEqual({
      '1': {
        class_type: 'EmptyLatentImage',
        inputs: { width: 768, height: 512 },
      },
      '2': {
        class_type: 'RandomNoise',
        inputs: { noise_seed: 9007199254740991 },
      },
    })
  })

  it('fills the prompt as text, quotes and all', () => {
    const filled = fillWorkflow(
      { '1': { class_type: 'CLIPTextEncode', inputs: { text: '{{prompt}}' } } },
      values,
    )

    expect(filled['1']?.inputs.text).toBe('a "quoted" phone')
  })

  it('fills a placeholder inside a longer string as text', () => {
    const filled = fillWorkflow(
      {
        '1': {
          class_type: 'CLIPTextEncode',
          inputs: { text: 'product photo of {{prompt}}, {{width}} wide' },
        },
      },
      values,
    )

    expect(filled['1']?.inputs.text).toBe(
      'product photo of a "quoted" phone, 768 wide',
    )
  })

  it('leaves links and values with no placeholder alone', () => {
    const graph = {
      '1': {
        class_type: 'VAEDecode',
        inputs: { samples: ['2', 0], vae: ['3', 0], name: 'plain' },
      },
    }

    expect(fillWorkflow(graph, values)).toEqual(graph)
  })
})

describe('checkWorkflow', () => {
  it('refuses usage when no input holds {{prompt}}', () => {
    expect(() =>
      checkWorkflow(
        { '1': { class_type: 'CLIPTextEncode', inputs: { text: 'a cat' } } },
        'cat.json',
      ),
    ).toThrow(expect.objectContaining({ code: 'usage' }))
  })

  it('refuses usage for a graph in the editor format rather than the API one', () => {
    expect(() =>
      checkWorkflow({ nodes: [], links: [], version: 0.4 }, 'ui.json'),
    ).toThrow(expect.objectContaining({ code: 'usage' }))
  })

  it('accepts the bundled workflow with every placeholder in it', () => {
    const graph = checkWorkflow(BUNDLED_WORKFLOW, 'bundled')

    const filled = JSON.stringify(fillWorkflow(graph, values))
    expect(filled).not.toContain('{{')
    expect(filled).toContain('"noise_seed":9007199254740991')
  })

  it('refuses usage for a model workflow holding no {{image}}', () => {
    expect(() => checkWorkflow(BUNDLED_WORKFLOW, 'flux.json', 'model')).toThrow(
      expect.objectContaining({
        code: 'usage',
        message: expect.stringContaining('{{image}}'),
      }),
    )
  })

  it('accepts the bundled model workflow and fills its picture and every sampler seed', () => {
    const graph = checkWorkflow(BUNDLED_MODEL_WORKFLOW, 'bundled', 'model')

    const filled = fillWorkflow(graph, { image: 'axe (1).png', seed: 7 })

    expect(JSON.stringify(filled)).not.toContain('{{')
    const nodes = Object.values(filled)
    expect(
      nodes.find((node) => node.class_type === 'LoadImage')?.inputs.image,
    ).toBe('axe (1).png')
    expect(
      nodes
        .filter((node) => node.class_type === 'KSampler')
        .map((node) => node.inputs.seed),
    ).toEqual([7, 7, 7, 7])
  })
})

describe('readWorkflow', () => {
  let folder: string

  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), 'workflow-'))
  })

  afterEach(() => {
    rmSync(folder, { recursive: true, force: true })
  })

  it('reads and checks an API-format file', async () => {
    const path = join(folder, 'mine.json')
    writeFileSync(
      path,
      JSON.stringify({
        '1': { class_type: 'CLIPTextEncode', inputs: { text: '{{prompt}}' } },
      }),
    )

    const graph = await readWorkflow(path)

    expect(graph['1']?.class_type).toBe('CLIPTextEncode')
  })

  it('refuses usage for a file that is not JSON', async () => {
    const path = join(folder, 'broken.json')
    writeFileSync(path, '{ nope')

    await expect(readWorkflow(path)).rejects.toMatchObject({ code: 'usage' })
  })

  it('refuses usage for a file that is not there', async () => {
    await expect(
      readWorkflow(join(folder, 'missing.json')),
    ).rejects.toMatchObject({ code: 'usage' })
  })
})
