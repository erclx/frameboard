import { execFile } from 'node:child_process'

import type { ImageDoctor } from '@/shared/records/sourcing'

import { type Environment, keyOf, PROVIDERS } from './generate'

/** Where a local ComfyUI server listens unless `FRAMEBOARD_COMFYUI_URL` names another. */
export const DEFAULT_COMFYUI_URL = 'http://127.0.0.1:8188'

/** How long a probe waits, so a machine with nothing listening answers at once. */
export const PROBE_TIMEOUT_MS = 1000

/** The ComfyUI server `FRAMEBOARD_COMFYUI_URL` names, else the default address. */
export function comfyuiUrl(env: Environment): string {
  return env.FRAMEBOARD_COMFYUI_URL?.trim() || DEFAULT_COMFYUI_URL
}

/** Runs `nvidia-smi` with the arguments given, answering its stdout or null when it fails or is absent. */
export type GpuQuery = (args: string[]) => Promise<string | null>

export function runNvidiaSmi(args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    execFile('nvidia-smi', args, { timeout: 5000 }, (error, stdout) =>
      resolve(error ? null : stdout),
    )
  })
}

/**
 * The GPU, the local server, and which keys are set, reading each key's
 * presence and never its value. Installs and spends nothing.
 */
export async function diagnose({
  env,
  send,
  queryGpu,
}: {
  env: Environment
  send: typeof fetch
  queryGpu: GpuQuery
}): Promise<ImageDoctor> {
  const url = comfyuiUrl(env)
  const [gpu, running] = await Promise.all([
    readGpu(queryGpu),
    probe(url, send),
  ])
  const providers = PROVIDERS.map((provider) => ({
    provider: provider.name,
    model: provider.model,
    key: provider.keyEnv,
    ready: keyOf(provider, env) !== null,
  }))
  return {
    version: 1,
    gpu,
    local: { url, running },
    keys: Object.fromEntries(providers.map((each) => [each.key, each.ready])),
    providers,
    provider: providers.find((each) => each.ready)?.provider ?? null,
  }
}

async function readGpu(
  queryGpu: GpuQuery,
): Promise<{ name: string; memoryMiB: number } | null> {
  const out = await queryGpu([
    '--query-gpu=name,memory.total',
    '--format=csv,noheader,nounits',
  ])
  const [name, memory] = (out?.split('\n')[0] ?? '')
    .split(',')
    .map((part) => part.trim())
  const memoryMiB = Number(memory)
  if (!name || !Number.isSafeInteger(memoryMiB)) return null
  return { name, memoryMiB }
}

/** True when ComfyUI's `/system_stats` answers within the probe timeout. */
async function probe(url: string, send: typeof fetch): Promise<boolean> {
  try {
    const response = await send(new URL('/system_stats', url), {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    })
    return response.ok
  } catch {
    return false
  }
}
