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

    expect(asked).toEqual(['http://192.168.1.20:8188/system_stats'])
    expect(report.local).toEqual({
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

    expect(report.local).toEqual({
      url: 'http://127.0.0.1:8188',
      running: false,
    })
  })
})
