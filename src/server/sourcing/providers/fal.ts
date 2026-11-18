import { imageExtension } from '../save'
import type { ImageProvider } from './provider'
import { providerFailed, roundPrice } from './provider'

/** fal's synchronous run endpoint for FLUX.1 schnell. */
export const FAL_ENDPOINT = 'https://fal.run/fal-ai/flux/schnell'

/** fal's published price for FLUX.1 schnell, per megapixel of output. */
export const FAL_PRICE_PER_MEGAPIXEL = 0.003

/** FLUX.1 schnell on fal, which takes any width and height as asked. */
export const fal: ImageProvider = {
  name: 'fal',
  model: 'fal-ai/flux/schnell',
  keyEnv: 'FAL_KEY',
  sizeFor: (asked) => asked,
  priceFor: ({ width, height }) =>
    roundPrice(((width * height) / 1_000_000) * FAL_PRICE_PER_MEGAPIXEL),
  async generate({ prompt, size, key }, send) {
    let response: Response
    try {
      response = await send(FAL_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Key ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          image_size: size,
          num_images: 1,
          output_format: 'jpeg',
          // Answers the image inline as a data URI, so no second request fetches it.
          sync_mode: true,
        }),
      })
    } catch (error) {
      throw providerFailed('fal', null, String(error), key)
    }
    const body: unknown = await response.json().catch(() => null)
    if (!response.ok) {
      throw providerFailed('fal', response.status, detailOf(body), key)
    }
    const url = firstImageUrl(body)
    const image = url === null ? null : await fetchImage(url, send)
    if (image === null) {
      throw providerFailed('fal', response.status, 'no image came back', key)
    }
    return image
  },
}

function firstImageUrl(body: unknown): string | null {
  if (typeof body !== 'object' || body === null || !('images' in body)) {
    return null
  }
  const [first] = Array.isArray(body.images) ? body.images : []
  return typeof first === 'object' &&
    first !== null &&
    'url' in first &&
    typeof first.url === 'string'
    ? first.url
    : null
}

/** The image a data URI holds, or the one a hosted URL serves, null when neither is an image. */
async function fetchImage(
  url: string,
  send: typeof fetch,
): Promise<{ bytes: Uint8Array; extension: string } | null> {
  const data = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(url)
  if (data) {
    const extension = imageExtension(data[1] ?? null, null)
    if (extension === null || data[2] === undefined) return null
    return {
      bytes: new Uint8Array(Buffer.from(data[3] ?? '', 'base64')),
      extension,
    }
  }
  const response = await send(url).catch(() => null)
  if (!response?.ok) return null
  const extension = imageExtension(response.headers.get('content-type'), url)
  if (extension === null) return null
  return { bytes: new Uint8Array(await response.arrayBuffer()), extension }
}

function detailOf(body: unknown): string {
  if (typeof body === 'object' && body !== null && 'detail' in body) {
    return typeof body.detail === 'string'
      ? body.detail
      : JSON.stringify(body.detail)
  }
  return 'the request was refused'
}
