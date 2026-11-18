import { FrameboardError } from '@/shared/errors'
import type { ImageProviderName } from '@/shared/records/sourcing'

import type { ImageBytes } from '../save'

export interface ImageSize {
  width: number
  height: number
}

/** What one provider call needs, the key read from the environment just before. */
export interface ProviderRequest {
  prompt: string
  size: ImageSize
  key: string
}

/** One way to generate an image, each keyed by its own environment variable. */
export interface ImageProvider {
  name: ImageProviderName
  model: string
  keyEnv: string
  /** The size it produces for the size asked, which may round to one it supports. */
  sizeFor: (asked: ImageSize) => ImageSize
  /** US dollars for one image at a size `sizeFor` gave. */
  priceFor: (size: ImageSize) => number
  /** Refuses `provider-failed` on any failure, never with the key in its message or details. */
  generate: (
    request: ProviderRequest,
    send: typeof fetch,
  ) => Promise<ImageBytes>
}

/**
 * The refusal a provider's failure answers, with its status and its own
 * message, the key scrubbed from that message should the provider echo it.
 */
export function providerFailed(
  provider: ImageProviderName,
  status: number | null,
  reason: string,
  key: string,
): FrameboardError {
  const scrubbed = reason.split(key).join('***').slice(0, 300)
  return new FrameboardError(
    'provider-failed',
    `${provider} ${status === null ? 'did not answer' : `answered ${status}`}: ${scrubbed}`,
    { provider, status },
  )
}

/** A dollar amount rounded up to a hundredth of a cent, so an estimate never reads low. */
export function roundPrice(usd: number): number {
  return Math.ceil(usd * 10_000 - 1e-9) / 10_000
}
