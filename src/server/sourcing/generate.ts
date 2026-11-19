import { basename } from 'node:path'

import { FrameboardError } from '@/shared/errors'
import { IMAGE_PROVIDERS } from '@/shared/records/sourcing'

import { comfyui } from './providers/comfyui'
import { fal } from './providers/fal'
import { google } from './providers/google'
import type {
  ImageProvider,
  ImageSize,
  NamedWorkflow,
} from './providers/provider'
import type { ImageBytes } from './save'

/**
 * Every provider in the order `image generate` tries them, the developer's
 * own server first since it charges nothing and setting its URL opts in.
 */
export const PROVIDERS: readonly ImageProvider[] = [comfyui, fal, google]

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
  /** The provider's model, or the workflow file's name when one is run. */
  model: string
  prompt: string
  size: ImageSize
  priceUsd: number
  key: string
  /** Drawn per call, so ComfyUI never answers a cached image for a repeated prompt. */
  seed: number
  workflow?: NamedWorkflow
}

/**
 * The provider a generation runs on, the one named or else the first whose
 * key is set, with the size it produces and its price. Makes no request.
 * A workflow runs on comfyui alone. Refuses `no-provider` when none is
 * ready, and `usage` for an unknown name or a workflow beside a hosted one.
 */
export function planGeneration(
  request: {
    prompt: string
    size: ImageSize
    provider?: string
    workflow?: NamedWorkflow
  },
  env: Environment,
  random: () => number = Math.random,
): GenerationPlan {
  const named =
    request.provider ?? (request.workflow ? comfyui.name : undefined)
  if (request.workflow && named !== comfyui.name) {
    throw new FrameboardError(
      'usage',
      `--workflow runs on ${comfyui.name} alone, not --provider ${named}.`,
      { provider: named },
    )
  }
  const candidates =
    named === undefined
      ? PROVIDERS
      : PROVIDERS.filter((each) => each.name === named)
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
      model: request.workflow
        ? basename(request.workflow.name)
        : provider.model,
      prompt: request.prompt,
      size,
      priceUsd: provider.priceFor(size),
      key,
      seed: Math.floor(random() * Number.MAX_SAFE_INTEGER),
      ...(request.workflow && { workflow: request.workflow }),
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
    {
      prompt: plan.prompt,
      size: plan.size,
      key: plan.key,
      seed: plan.seed,
      workflow: plan.workflow,
    },
    send,
  )
}
