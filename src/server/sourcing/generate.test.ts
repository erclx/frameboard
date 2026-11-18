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
        details: { keys: ['FAL_KEY', 'GEMINI_API_KEY'] },
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
})
