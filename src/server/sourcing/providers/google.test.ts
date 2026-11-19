import { describe, expect, it } from 'vitest'

import { aspectRatioFor, google } from './google'

const request = {
  prompt: 'a house',
  size: { width: 1376, height: 768 },
  key: 'gem-secret',
  seed: 1,
}

/** A fake Gemini API answering one status and body, recording each request. */
function geminiAnswering(status: number, body: unknown) {
  const requests: { url: string; init?: RequestInit }[] = []
  const send = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), init })
    return Response.json(body, { status })
  }) as typeof fetch
  return { send, requests }
}

describe('google', () => {
  it('sends the key as x-goog-api-key and the aspect ratio at 1K', async () => {
    const { send, requests } = geminiAnswering(200, {
      steps: [
        { type: 'model_output', content: [{ type: 'image', data: 'AQID' }] },
      ],
    })

    await google.generate(request, send)

    const init = requests[0]?.init
    expect(new Headers(init?.headers).get('x-goog-api-key')).toBe('gem-secret')
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: 'gemini-nano-banana-2.1',
      input: [{ type: 'text', text: 'a house' }],
      response_format: {
        type: 'image',
        aspect_ratio: '16:9',
        image_size: '1K',
      },
    })
  })

  it('reads the image from the model output steps', async () => {
    const { send } = geminiAnswering(200, {
      steps: [
        { type: 'thought', summary: [] },
        {
          type: 'model_output',
          content: [
            { type: 'text', text: 'Here it is' },
            { type: 'image', data: 'AQID', mime_type: 'image/png' },
          ],
        },
      ],
    })

    const image = await google.generate(request, send)

    expect(image).toEqual({
      bytes: new Uint8Array([1, 2, 3]),
      extension: 'png',
    })
  })

  it('reads the image from output_image when the answer carries one', async () => {
    const { send } = geminiAnswering(200, { output_image: { data: 'AQID' } })

    const image = await google.generate(request, send)

    expect(image.extension).toBe('jpg')
  })

  it('refuses provider-failed with the status and no key on a refusal', async () => {
    const { send } = geminiAnswering(403, {
      error: { message: 'API key gem-secret not valid' },
    })

    const failure = await google.generate(request, send).catch((error) => error)

    expect(failure).toMatchObject({
      code: 'provider-failed',
      details: { provider: 'google', status: 403 },
    })
    expect(JSON.stringify([failure.message, failure.details])).not.toContain(
      'gem-secret',
    )
  })

  it.each([
    [{ width: 1024, height: 1024 }, '1:1'],
    [{ width: 1920, height: 1080 }, '16:9'],
    [{ width: 390, height: 844 }, '9:16'],
    [{ width: 1200, height: 630 }, '16:9'],
  ])('takes the nearest aspect ratio for %o as %s', (size, ratio) => {
    expect(aspectRatioFor(size)).toBe(ratio)
  })
})
