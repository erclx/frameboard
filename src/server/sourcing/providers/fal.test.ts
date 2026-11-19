import { describe, expect, it } from 'vitest'

import { fal } from './fal'

const request = {
  prompt: 'a house',
  size: { width: 1024, height: 768 },
  key: 'fal-secret',
  seed: 1,
}

/** A fake fal answering one status and body, recording each request. */
function falAnswering(status: number, body: unknown) {
  const requests: { url: string; init?: RequestInit }[] = []
  const send = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(input), init })
    return Response.json(body, { status })
  }) as typeof fetch
  return { send, requests }
}

describe('fal', () => {
  it('sends the key as a Key authorization and the size as asked', async () => {
    const { send, requests } = falAnswering(200, {
      images: [{ url: 'data:image/jpeg;base64,AQID' }],
    })

    await fal.generate(request, send)

    const init = requests[0]?.init
    expect(new Headers(init?.headers).get('authorization')).toBe(
      'Key fal-secret',
    )
    expect(JSON.parse(String(init?.body))).toMatchObject({
      prompt: 'a house',
      image_size: { width: 1024, height: 768 },
      num_images: 1,
      sync_mode: true,
    })
  })

  it('decodes the inline image fal answers', async () => {
    const { send } = falAnswering(200, {
      images: [{ url: 'data:image/png;base64,AQID' }],
    })

    const image = await fal.generate(request, send)

    expect(image).toEqual({
      bytes: new Uint8Array([1, 2, 3]),
      extension: 'png',
    })
  })

  it('refuses provider-failed with the status and no key on a refusal', async () => {
    const { send } = falAnswering(401, {
      detail: 'Invalid key fal-secret',
    })

    const failure = await fal.generate(request, send).catch((error) => error)

    expect(failure).toMatchObject({
      code: 'provider-failed',
      details: { provider: 'fal', status: 401 },
    })
    expect(JSON.stringify([failure.message, failure.details])).not.toContain(
      'fal-secret',
    )
  })

  it('refuses provider-failed when no image comes back', async () => {
    const { send } = falAnswering(200, { images: [] })

    await expect(fal.generate(request, send)).rejects.toMatchObject({
      code: 'provider-failed',
    })
  })

  it('prices a megapixel at three tenths of a cent, rounded up', () => {
    expect(fal.priceFor({ width: 1000, height: 1000 })).toBe(0.003)
    expect(fal.priceFor({ width: 1024, height: 768 })).toBe(0.0024)
  })
})
