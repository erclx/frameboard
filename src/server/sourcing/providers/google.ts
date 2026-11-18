import { imageExtension } from '../save'
import type { ImageProvider, ImageSize } from './provider'
import { providerFailed } from './provider'

/** The Gemini API's Interactions endpoint, the one its image guide calls. */
export const GOOGLE_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/interactions'

/** The API revision the request shape below was written against. */
export const GOOGLE_API_REVISION = '2026-05-20'

/** Google's published price for one 1K image from Nano Banana 2.1. */
export const GOOGLE_PRICE_1K = 0.0336

/** Each aspect ratio Nano Banana 2.1 takes, with the size it draws at 1K. */
export const ASPECT_RATIOS: Record<string, ImageSize> = {
  '1:1': { width: 1024, height: 1024 },
  '1:4': { width: 512, height: 2048 },
  '1:8': { width: 384, height: 3072 },
  '2:3': { width: 848, height: 1264 },
  '3:2': { width: 1264, height: 848 },
  '3:4': { width: 896, height: 1200 },
  '4:1': { width: 2048, height: 512 },
  '4:3': { width: 1200, height: 896 },
  '4:5': { width: 928, height: 1152 },
  '5:4': { width: 1152, height: 928 },
  '8:1': { width: 3072, height: 384 },
  '9:16': { width: 768, height: 1376 },
  '16:9': { width: 1376, height: 768 },
  '21:9': { width: 1584, height: 672 },
}

/** The aspect ratio nearest the size asked, compared on a log scale so tall and wide weigh alike. */
export function aspectRatioFor({ width, height }: ImageSize): string {
  const asked = Math.log(width / height)
  let best = '1:1'
  let distance = Number.POSITIVE_INFINITY
  for (const [ratio, size] of Object.entries(ASPECT_RATIOS)) {
    const gap = Math.abs(Math.log(size.width / size.height) - asked)
    if (gap < distance) {
      best = ratio
      distance = gap
    }
  }
  return best
}

/** Nano Banana 2.1 at 1K, at the aspect ratio nearest the size asked. */
export const google: ImageProvider = {
  name: 'google',
  model: 'gemini-nano-banana-2.1',
  keyEnv: 'GEMINI_API_KEY',
  sizeFor: (asked) => ASPECT_RATIOS[aspectRatioFor(asked)] ?? asked,
  priceFor: () => GOOGLE_PRICE_1K,
  async generate({ prompt, size, key }, send) {
    let response: Response
    try {
      response = await send(GOOGLE_ENDPOINT, {
        method: 'POST',
        headers: {
          'x-goog-api-key': key,
          'Content-Type': 'application/json',
          'Api-Revision': GOOGLE_API_REVISION,
        },
        body: JSON.stringify({
          model: google.model,
          input: [{ type: 'text', text: prompt }],
          response_format: {
            type: 'image',
            mime_type: 'image/jpeg',
            aspect_ratio: aspectRatioFor(size),
            image_size: '1K',
          },
        }),
      })
    } catch (error) {
      throw providerFailed('google', null, String(error), key)
    }
    const body: unknown = await response.json().catch(() => null)
    if (!response.ok) {
      throw providerFailed('google', response.status, messageOf(body), key)
    }
    const image = imageOf(body)
    const extension = imageExtension(image?.mimeType ?? 'image/jpeg', null)
    if (image === null || extension === null) {
      throw providerFailed('google', response.status, 'no image came back', key)
    }
    return {
      bytes: new Uint8Array(Buffer.from(image.data, 'base64')),
      extension,
    }
  },
}

/** The first image the interaction output, from `output_image` or else its model output steps. */
function imageOf(
  body: unknown,
): { data: string; mimeType: string | null } | null {
  if (!isRecord(body)) return null
  const blocks: unknown[] = [body.output_image]
  for (const step of Array.isArray(body.steps) ? body.steps : []) {
    if (isRecord(step) && step.type === 'model_output') {
      blocks.push(...(Array.isArray(step.content) ? step.content : []))
    }
  }
  for (const block of blocks) {
    if (!isRecord(block) || typeof block.data !== 'string') continue
    if (block.type !== undefined && block.type !== 'image') continue
    return {
      data: block.data,
      mimeType: typeof block.mime_type === 'string' ? block.mime_type : null,
    }
  }
  return null
}

function messageOf(body: unknown): string {
  if (isRecord(body) && isRecord(body.error)) {
    return typeof body.error.message === 'string'
      ? body.error.message
      : 'the request was refused'
  }
  return 'the request was refused'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
