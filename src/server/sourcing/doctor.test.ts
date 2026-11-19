import { describe, expect, it } from 'vitest'

import { diagnose } from './doctor'

const nothingListening = (async () => {
  throw new TypeError('fetch failed')
}) as typeof fetch

const noGpu = async () => null

describe('diagnose', () => {
  it('reports each key as set or unset and never its value', async () => {
    const report = await diagnose({
      env: { FAL_KEY: 'fal-secret', GEMINI_API_KEY: '' },
      send: nothingListening,
      queryGpu: noGpu,
    })

    expect(report.keys).toEqual({
      FRAMEBOARD_COMFYUI_URL: false,
      FAL_KEY: true,
      GEMINI_API_KEY: false,
    })
    expect(report.provider).toBe('fal')
    expect(JSON.stringify(report)).not.toContain('fal-secret')
  })

  it('reports gpu null when nvidia-smi is absent', async () => {
    const report = await diagnose({
      env: {},
      send: nothingListening,
      queryGpu: noGpu,
    })

    expect(report.gpu).toBeNull()
    expect(report.provider).toBeNull()
  })

  it('reads the first GPU nvidia-smi lists', async () => {
    const report = await diagnose({
      env: {},
      send: nothingListening,
      queryGpu: async () =>
        'NVIDIA GeForce RTX 5090, 32607\nNVIDIA GeForce RTX 3060, 12288\n',
    })

    expect(report.gpu).toEqual({
      name: 'NVIDIA GeForce RTX 5090',
      memoryMiB: 32607,
    })
  })

  it('probes the local server at FRAMEBOARD_COMFYUI_URL', async () => {
    const asked: string[] = []
    const send = (async (input: string | URL | Request) => {
      asked.push(String(input))
      return Response.json({ system: {} })
    }) as typeof fetch

    const report = await diagnose({
      env: { FRAMEBOARD_COMFYUI_URL: 'http://192.168.1.20:8188' },
      send,
      queryGpu: noGpu,
    })

    expect(asked[0]).toBe('http://192.168.1.20:8188/system_stats')
    expect(report.local).toMatchObject({
      url: 'http://192.168.1.20:8188',
      running: true,
    })
  })

  it('reports the local server as not running when nothing answers', async () => {
    const report = await diagnose({
      env: {},
      send: nothingListening,
      queryGpu: noGpu,
    })

    expect(report.local).toMatchObject({
      url: 'http://127.0.0.1:8188',
      running: false,
    })
  })
})

/** A fake ComfyUI answering its version and the model files each folder holds. */
function comfyServer(version: string, folders: Record<string, string[]>) {
  const asked: string[] = []
  const send = (async (input: string | URL | Request) => {
    const url = new URL(String(input))
    asked.push(url.href)
    if (url.pathname.endsWith('/system_stats')) {
      return Response.json({ system: { comfyui_version: version } })
    }
    const folder = /\/models\/([^/]+)$/.exec(url.pathname)?.[1] ?? ''
    return Response.json(folders[folder] ?? [])
  }) as typeof fetch
  return { send, asked }
}

const allModels = {
  diffusion_models: ['flux-2-klein-4b-fp8.safetensors'],
  text_encoders: ['qwen_3_4b.safetensors', 'other.safetensors'],
  vae: ['flux2-vae.safetensors'],
}

const rtx = async () => 'NVIDIA GeForce RTX 5090, 32607\n'

describe('diagnose with a ComfyUI server', () => {
  const env = { FRAMEBOARD_COMFYUI_URL: 'http://127.0.0.1:8188/' }

  it('reports the version, no missing file, and no step when all is in place', async () => {
    const { send, asked } = comfyServer('0.46.0', allModels)

    const report = await diagnose({ env, send, queryGpu: rtx })

    expect(report.local).toEqual({
      url: 'http://127.0.0.1:8188/',
      running: true,
      version: '0.46.0',
      missing: [],
    })
    expect(report.setup).toEqual([])
    expect(asked).toContain('http://127.0.0.1:8188/models/diffusion_models')
  })

  it('names a missing model file with its folder, size, and download', async () => {
    const { send } = comfyServer('0.46.0', { ...allModels, vae: [] })

    const report = await diagnose({ env, send, queryGpu: rtx })

    expect(report.local.missing).toEqual([
      {
        folder: 'vae',
        file: 'flux2-vae.safetensors',
        bytes: 336213556,
        url: 'https://huggingface.co/Comfy-Org/flux2-dev/resolve/main/split_files/vae/flux2-vae.safetensors',
      },
    ])
    expect(report.setup).toEqual([
      'curl -L -o models/vae/flux2-vae.safetensors https://huggingface.co/Comfy-Org/flux2-dev/resolve/main/split_files/vae/flux2-vae.safetensors  # 0.34 GB',
    ])
  })

  it('asks for an update when the server is older than v0.46.0', async () => {
    const { send } = comfyServer('0.9.2', allModels)

    const report = await diagnose({ env, send, queryGpu: rtx })

    expect(report.setup).toEqual([
      'git pull && uv pip install -r requirements.txt  # in the ComfyUI folder, since FLUX.2 klein needs v0.46.0 or later',
    ])
  })

  it('prints every step with torch from the CUDA index when no server answers on NVIDIA', async () => {
    const report = await diagnose({
      env: {},
      send: nothingListening,
      queryGpu: rtx,
    })

    expect(report.local).toMatchObject({
      running: false,
      version: null,
      missing: null,
    })
    expect(report.setup).toContain(
      'uv pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu130',
    )
    expect(report.setup).toContain(
      'curl -L -o models/text_encoders/qwen_3_4b.safetensors https://huggingface.co/Comfy-Org/z_image_turbo/resolve/main/split_files/text_encoders/qwen_3_4b.safetensors  # 8.04 GB',
    )
    expect(report.setup.at(-1)).toBe(
      'export FRAMEBOARD_COMFYUI_URL=http://127.0.0.1:8188',
    )
  })

  it('installs torch from the default index when no NVIDIA GPU is found', async () => {
    const report = await diagnose({
      env: {},
      send: nothingListening,
      queryGpu: noGpu,
    })

    expect(report.setup).toContain(
      'uv pip install torch torchvision torchaudio',
    )
    expect(report.setup.join('\n')).not.toContain('cu130')
  })
})
