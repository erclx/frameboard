import { FrameboardError } from '@/shared/errors'
import { IMAGE_PROVIDERS } from '@/shared/records/sourcing'

import { fal } from './providers/fal'
import { google } from './providers/google'
import type { ImageProvider, ImageSize } from './providers/provider'
import type { ImageBytes } from './save'

/** Every provider in the order `image generate` tries them. */
export const PROVIDERS: readonly ImageProvider[] = [fal, google]

export type Environment = Record<string, string | undefined>

/** A provider's key, null when unset or empty, so an empty string never reaches a request. */
export function keyOf(
  provider: ImageProvider,
  env: Environment,
): string | null {
  const key = env[provider.keyEnv]?.trim()
  return key === undefined || key === '' ? null : key
}

/** A call decided and priced, holding the key for the request alone. */
export interface GenerationPlan {
  provider: ImageProvider
  prompt: string
  size: ImageSize
  priceUsd: number
  key: string
}

/**
 * The provider a generation runs on, the one named or else the first whose
 * key is set, with the size it produces and its price. Makes no request.
 * Refuses `no-provider` when none is ready, and `usage` for an unknown name.
 */
export function planGeneration(
  request: { prompt: string; size: ImageSize; provider?: string },
  env: Environment,
): GenerationPlan {
  const candidates =
    request.provider === undefined
      ? PROVIDERS
      : PROVIDERS.filter((each) => each.name === request.provider)
  if (candidates.length === 0) {
    throw new FrameboardError(
      'usage',
      `--provider ${request.provider} is not one of ${IMAGE_PROVIDERS.join(', ')}.`,
      { providers: [...IMAGE_PROVIDERS] },
    )
  }
  for (const provider of candidates) {
    const key = keyOf(provider, env)
    if (key === null) continue
    const size = provider.sizeFor(request.size)
    return {
      provider,
      prompt: request.prompt,
      size,
      priceUsd: provider.priceFor(size),
      key,
    }
  }
  const keys = candidates.map((each) => each.keyEnv)
  throw new FrameboardError(
    'no-provider',
    `No image provider is ready. Set ${keys.join(' or ')} in the environment.`,
    { keys },
  )
}

/** Runs a planned call, the one point a generation spends. */
export function generateImage(
  plan: GenerationPlan,
  send: typeof fetch,
): Promise<ImageBytes> {
  return plan.provider.generate(
    { prompt: plan.prompt, size: plan.size, key: plan.key },
    send,
  )
}
