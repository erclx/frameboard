import { execFile } from 'node:child_process'

import type { ImageDoctor, MissingModel } from '@/shared/records/sourcing'

import { routeOf } from './comfyui/client'
import { type Environment, keyOf, PROVIDERS } from './generate'

/** Where a local ComfyUI server listens unless `FRAMEBOARD_COMFYUI_URL` names another. */
export const DEFAULT_COMFYUI_URL = 'http://127.0.0.1:8188'

/** How long a probe waits, so a machine with nothing listening answers at once. */
export const PROBE_TIMEOUT_MS = 1000

/** The oldest ComfyUI whose native nodes run FLUX.2 klein, the release groundwork 54 ran. */
export const MIN_COMFYUI_VERSION = '0.46.0'

/** The files the bundled workflow loads, with the size and source each was measured at. */
export const BUNDLED_MODELS: readonly MissingModel[] = [
  {
    folder: 'diffusion_models',
    file: 'flux-2-klein-4b-fp8.safetensors',
    bytes: 4_070_624_520,
    url: 'https://huggingface.co/black-forest-labs/FLUX.2-klein-4b-fp8/resolve/main/flux-2-klein-4b-fp8.safetensors',
  },
  {
    folder: 'text_encoders',
    file: 'qwen_3_4b.safetensors',
    bytes: 8_044_982_048,
    url: 'https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/text_encoders/qwen_3_4b.safetensors',
  },
  {
    folder: 'vae',
    file: 'flux2-vae.safetensors',
    bytes: 336_213_556,
    url: 'https://huggingface.co/Comfy-Org/flux2-dev/resolve/main/split_files/vae/flux2-vae.safetensors',
  },
]

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
  const [gpu, version] = await Promise.all([
    readGpu(queryGpu),
    probe(url, send),
  ])
  const running = version !== undefined
  const missing = running ? await missingModels(url, send) : null
  const providers = PROVIDERS.map((provider) => ({
    provider: provider.name,
    model: provider.model,
    key: provider.keyEnv,
    ready: keyOf(provider, env) !== null,
  }))
  return {
    version: 1,
    gpu,
    local: { url, running, version: version ?? null, missing },
    setup: setupSteps({
      nvidia: gpu !== null,
      version,
      missing,
      urlSet: Boolean(env.FRAMEBOARD_COMFYUI_URL?.trim()),
    }),
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

/**
 * The version ComfyUI's `/system_stats` reports, null when it answers with
 * none, and undefined when nothing answers within the probe timeout.
 */
async function probe(
  url: string,
  send: typeof fetch,
): Promise<string | null | undefined> {
  try {
    const response = await send(routeOf(url, 'system_stats'), {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    })
    if (!response.ok) return undefined
    const body: unknown = await response.json().catch(() => null)
    const system =
      typeof body === 'object' && body !== null && 'system' in body
        ? body.system
        : null
    return typeof system === 'object' &&
      system !== null &&
      'comfyui_version' in system &&
      typeof system.comfyui_version === 'string'
      ? system.comfyui_version
      : null
  } catch {
    return undefined
  }
}

/** The bundled workflow's files that the folder listing ComfyUI answers lacks. */
async function missingModels(
  url: string,
  send: typeof fetch,
): Promise<MissingModel[]> {
  const folders = [...new Set(BUNDLED_MODELS.map((each) => each.folder))]
  const listed = await Promise.all(
    folders.map(async (folder): Promise<[string, unknown[]]> => {
      try {
        const response = await send(routeOf(url, `models/${folder}`), {
          signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        })
        const body: unknown = response.ok ? await response.json() : []
        return [folder, Array.isArray(body) ? (body as unknown[]) : []]
      } catch {
        return [folder, []]
      }
    }),
  )
  const held = new Map<string, unknown[]>(listed)
  return BUNDLED_MODELS.filter(
    (model) => !held.get(model.folder)?.includes(model.file),
  )
}

/**
 * The commands that would get this machine generating locally, empty when
 * it already can. The doctor prints them and never runs one.
 */
function setupSteps({
  nvidia,
  version,
  missing,
  urlSet,
}: {
  nvidia: boolean
  version: string | null | undefined
  missing: readonly MissingModel[] | null
  urlSet: boolean
}): string[] {
  const exportUrl = urlSet
    ? []
    : [`export FRAMEBOARD_COMFYUI_URL=${DEFAULT_COMFYUI_URL}`]
  if (missing === null) {
    return [
      `git clone https://github.com/Comfy-Org/ComfyUI && cd ComfyUI  # v${MIN_COMFYUI_VERSION} or later`,
      'uv venv --python 3.13 && source .venv/bin/activate',
      nvidia
        ? 'uv pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu130'
        : 'uv pip install torch torchvision torchaudio',
      'uv pip install -r requirements.txt',
      ...BUNDLED_MODELS.map(download),
      'python main.py --listen 127.0.0.1 --port 8188',
      ...exportUrl,
    ]
  }
  const update =
    version !== null && version !== undefined && olderThanMinimum(version)
      ? [
          `git pull && uv pip install -r requirements.txt  # in the ComfyUI folder, since FLUX.2 klein needs v${MIN_COMFYUI_VERSION} or later`,
        ]
      : []
  return [...update, ...missing.map(download), ...exportUrl]
}

function download(model: MissingModel): string {
  const gigabytes = (model.bytes / 1e9).toFixed(2)
  return `curl -L -o models/${model.folder}/${model.file} ${model.url}  # ${gigabytes} GB`
}

function olderThanMinimum(version: string): boolean {
  const parts = (text: string) =>
    text
      .replace(/^v/, '')
      .split('.')
      .map((each) => Number.parseInt(each, 10) || 0)
  const have = parts(version)
  const need = parts(MIN_COMFYUI_VERSION)
  for (let index = 0; index < need.length; index += 1) {
    const gap = (have[index] ?? 0) - (need[index] ?? 0)
    if (gap !== 0) return gap < 0
  }
  return false
}
