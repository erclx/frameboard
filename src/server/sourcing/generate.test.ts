import { describe, expect, it } from 'vitest'

import { generateImage, planGeneration } from './generate'

const square = { width: 1024, height: 1024 }

describe('planGeneration', () => {
  it('picks fal first when both keys are set, priced at its megapixel rate', () => {
    const plan = planGeneration(
      { prompt: 'a house', size: square },
      { FAL_KEY: 'fal-secret', GEMINI_API_KEY: 'gem-secret' },
    )

    expect(plan.provider.name).toBe('fal')
    expect(plan.size).toEqual(square)
    expect(plan.priceUsd).toBe(0.0032)
  })

  it('falls to Google when only its key is set, at its 1K price and size', () => {
    const plan = planGeneration(
      { prompt: 'a house', size: { width: 1920, height: 1080 } },
      { GEMINI_API_KEY: 'gem-secret' },
    )

    expect(plan.provider.name).toBe('google')
    expect(plan.size).toEqual({ width: 1376, height: 768 })
    expect(plan.priceUsd).toBe(0.0336)
  })

  it('takes the provider named over the order', () => {
    const plan = planGeneration(
      { prompt: 'a house', size: square, provider: 'google' },
      { FAL_KEY: 'fal-secret', GEMINI_API_KEY: 'gem-secret' },
    )

    expect(plan.provider.name).toBe('google')
  })

  it('refuses no-provider when no key is set', () => {
    expect(() =>
      planGeneration({ prompt: 'a house', size: square }, {}),
    ).toThrow(
      expect.objectContaining({
        code: 'no-provider',
        details: {
          keys: ['FRAMEBOARD_COMFYUI_URL', 'FAL_KEY', 'GEMINI_API_KEY'],
        },
      }),
    )
  })

  it('reads a key set to blank space as unset', () => {
    expect(() =>
      planGeneration({ prompt: 'a house', size: square }, { FAL_KEY: '  ' }),
    ).toThrow(expect.objectContaining({ code: 'no-provider' }))
  })

  it('refuses no-provider for a named provider whose key is unset', () => {
    expect(() =>
      planGeneration(
        { prompt: 'a house', size: square, provider: 'google' },
        { FAL_KEY: 'fal-secret' },
      ),
    ).toThrow(
      expect.objectContaining({
        code: 'no-provider',
        details: { keys: ['GEMINI_API_KEY'] },
      }),
    )
  })

  it('refuses usage for a provider name nobody holds', () => {
    expect(() =>
      planGeneration(
        { prompt: 'a house', size: square, provider: 'midjourney' },
        { FAL_KEY: 'fal-secret' },
      ),
    ).toThrow(expect.objectContaining({ code: 'usage' }))
  })
})

describe('planGeneration with a ComfyUI server', () => {
  const local = { FRAMEBOARD_COMFYUI_URL: 'http://127.0.0.1:8188' }

  it('picks comfyui first when its URL is set, at no charge', () => {
    const plan = planGeneration(
      { prompt: 'a house', size: { width: 1280, height: 720 } },
      { ...local, FAL_KEY: 'fal-secret' },
    )

    expect(plan.provider.name).toBe('comfyui')
    expect(plan.model).toBe('flux-2-klein-4b-fp8')
    expect(plan.size).toEqual({ width: 1280, height: 720 })
    expect(plan.priceUsd).toBe(0)
  })

  it('keeps fal first when the URL is unset', () => {
    const plan = planGeneration(
      { prompt: 'a house', size: square },
      { FRAMEBOARD_COMFYUI_URL: '', FAL_KEY: 'fal-secret' },
    )

    expect(plan.provider.name).toBe('fal')
  })

  it('draws the seed from the random source per call', () => {
    const plan = planGeneration(
      { prompt: 'a house', size: square },
      local,
      () => 0.5,
    )

    expect(plan.seed).toBe(4503599627370495)
  })

  it('runs a workflow on comfyui and names the model by its file', () => {
    const plan = planGeneration(
      {
        prompt: 'a house',
        size: square,
        workflow: { name: '/work/z-image.json', graph: {} },
      },
      { ...local, FAL_KEY: 'fal-secret' },
    )

    expect(plan.provider.name).toBe('comfyui')
    expect(plan.model).toBe('z-image.json')
  })

  it('refuses usage for a workflow beside a hosted provider', () => {
    expect(() =>
      planGeneration(
        {
          prompt: 'a house',
          size: square,
          provider: 'fal',
          workflow: { name: 'z-image.json', graph: {} },
        },
        { ...local, FAL_KEY: 'fal-secret' },
      ),
    ).toThrow(expect.objectContaining({ code: 'usage' }))
  })

  it('refuses no-provider for a workflow when the URL is unset', () => {
    expect(() =>
      planGeneration(
        {
          prompt: 'a house',
          size: square,
          workflow: { name: 'z-image.json', graph: {} },
        },
        { FAL_KEY: 'fal-secret' },
      ),
    ).toThrow(
      expect.objectContaining({
        code: 'no-provider',
        details: { keys: ['FRAMEBOARD_COMFYUI_URL'] },
      }),
    )
  })
})

describe('generateImage', () => {
  it('sends the one request the plan names', async () => {
    const asked: string[] = []
    const send = (async (input: string | URL | Request) => {
      asked.push(String(input))
      return Response.json({
        images: [{ url: 'data:image/jpeg;base64,AQID' }],
      })
    }) as typeof fetch
    const plan = planGeneration(
      { prompt: 'a house', size: square },
      { FAL_KEY: 'fal-secret' },
    )

    const image = await generateImage(plan, send)

    expect(asked).toEqual(['https://fal.run/fal-ai/flux/schnell'])
    expect([...image.bytes]).toEqual([1, 2, 3])
  })

  it('posts the bundled workflow filled with the prompt, size, and seed to the URL', async () => {
    const bodies: unknown[] = []
    const send = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input))
      if (url.pathname === '/prompt') {
        bodies.push(JSON.parse(String(init?.body)))
        return Response.json({ prompt_id: 'p1' })
      }
      if (url.pathname === '/history/p1') {
        return Response.json({
          p1: {
            status: { completed: true },
            outputs: {
              '9': {
                images: [{ filename: 'a.png', subfolder: '', type: 'output' }],
              },
            },
          },
        })
      }
      return new Response(new Uint8Array([4]), {
        headers: { 'content-type': 'image/png' },
      })
    }) as typeof fetch
    const plan = planGeneration(
      { prompt: 'a house', size: { width: 768, height: 512 } },
      { FRAMEBOARD_COMFYUI_URL: 'http://127.0.0.1:8188' },
      () => 0.5,
    )

    const image = await generateImage(plan, send)

    const sent = JSON.stringify(bodies[0])
    expect(sent).toContain('"text":"a house"')
    expect(sent).toContain('"width":768')
    expect(sent).toContain('"height":512')
    expect(sent).toContain('"noise_seed":4503599627370495')
    expect(image.extension).toBe('png')
  })
})
