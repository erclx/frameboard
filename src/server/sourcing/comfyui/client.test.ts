import { describe, expect, it } from 'vitest'

import { freeMemory, runWorkflow } from './client'
import type { Workflow } from './workflow'

const workflow: Workflow = {
  '9': { class_type: 'SaveImage', inputs: { images: ['8', 0] } },
}

/** A clock a run reads and a wait that moves it on, so a stall costs no real time. */
function fakeClock() {
  let at = 0
  return {
    now: () => at,
    wait: async (ms: number) => {
      at += ms
    },
  }
}

interface Route {
  method?: string
  path: string
  answer: () => Response
}

/** A fake ComfyUI answering each path its route names, recording every request. */
function server(routes: Route[]) {
  const asked: { method: string; url: string; body?: string }[] = []
  const send = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    const method = init?.method ?? 'GET'
    asked.push({ method, url: url.href, body: init?.body?.toString() })
    const route = routes.find(
      (each) =>
        `${url.pathname}${url.search}`.endsWith(each.path) &&
        (each.method ?? 'GET') === method,
    )
    return route ? route.answer() : new Response('not found', { status: 404 })
  }) as typeof fetch
  return { send, asked }
}

const queued = {
  method: 'POST',
  path: '/prompt',
  answer: () => Response.json({ prompt_id: 'p1', number: 0, node_errors: {} }),
}

function history(outputs: Record<string, unknown>) {
  return {
    path: '/history/p1',
    answer: () =>
      Response.json({
        p1: {
          outputs,
          status: { status_str: 'success', completed: true, messages: [] },
        },
      }),
  }
}

const png = {
  path: '/view?filename=frameboard_00001_.png&subfolder=&type=output',
  answer: () =>
    new Response(new Uint8Array([1, 2, 3]), {
      headers: { 'content-type': 'image/png' },
    }),
}

describe('runWorkflow', () => {
  it('posts the prompt, waits on its history, and reads the first output image', async () => {
    const { send, asked } = server([
      queued,
      history({
        '9': {
          images: [
            {
              filename: 'frameboard_00001_.png',
              subfolder: '',
              type: 'output',
            },
          ],
        },
        '10': {
          images: [
            {
              filename: 'second_00001_.png',
              subfolder: '',
              type: 'output',
            },
          ],
        },
      }),
      png,
    ])

    const image = await runWorkflow(
      'http://127.0.0.1:8188',
      workflow,
      send,
      fakeClock(),
    )

    expect(image).toEqual({
      bytes: new Uint8Array([1, 2, 3]),
      extension: 'png',
    })
    expect(JSON.parse(asked[0]?.body ?? '')).toEqual({ prompt: workflow })
    expect(asked.filter((each) => each.url.includes('second'))).toEqual([])
  })

  it('skips a temporary preview image for the saved one', async () => {
    const { send } = server([
      queued,
      history({
        '5': {
          images: [{ filename: 'preview.png', subfolder: '', type: 'temp' }],
        },
        '9': {
          images: [
            {
              filename: 'frameboard_00001_.png',
              subfolder: '',
              type: 'output',
            },
          ],
        },
      }),
      png,
    ])

    const image = await runWorkflow(
      'http://127.0.0.1:8188',
      workflow,
      send,
      fakeClock(),
    )

    expect([...image.bytes]).toEqual([1, 2, 3])
  })

  it('keeps waiting while the history is empty, as on a first call loading the model', async () => {
    let polls = 0
    const { send } = server([
      queued,
      {
        path: '/history/p1',
        answer: () => {
          polls += 1
          return polls < 40
            ? Response.json({})
            : Response.json({
                p1: {
                  outputs: {
                    '9': {
                      images: [
                        {
                          filename: 'frameboard_00001_.png',
                          subfolder: '',
                          type: 'output',
                        },
                      ],
                    },
                  },
                  status: { status_str: 'success', completed: true },
                },
              })
        },
      },
      png,
    ])

    const image = await runWorkflow(
      'http://127.0.0.1:8188',
      workflow,
      send,
      fakeClock(),
    )

    expect(polls).toBe(40)
    expect(image.extension).toBe('png')
  })

  it('refuses provider-failed naming the node ComfyUI refused the prompt over', async () => {
    const { send } = server([
      {
        method: 'POST',
        path: '/prompt',
        answer: () =>
          Response.json(
            {
              error: {
                type: 'prompt_outputs_failed_validation',
                message: 'Prompt outputs failed validation',
              },
              node_errors: {
                '70': {
                  class_type: 'UNETLoader',
                  errors: [
                    {
                      message: 'Value not in list',
                      details:
                        "unet_name: 'flux-2-klein-4b-fp8.safetensors' not in []",
                    },
                  ],
                },
              },
            },
            { status: 400 },
          ),
      },
    ])

    const failure = await runWorkflow(
      'http://127.0.0.1:8188',
      workflow,
      send,
      fakeClock(),
    ).catch((error: unknown) => error)

    expect(failure).toMatchObject({
      code: 'provider-failed',
      details: { provider: 'comfyui', status: 400, node: '70' },
    })
    expect(String(failure)).toContain('UNETLoader')
    expect(String(failure)).toContain('flux-2-klein-4b-fp8.safetensors')
  })

  it('refuses provider-failed naming the node a run failed in', async () => {
    const { send } = server([
      queued,
      {
        path: '/history/p1',
        answer: () =>
          Response.json({
            p1: {
              outputs: {},
              status: {
                status_str: 'error',
                completed: false,
                messages: [
                  [
                    'execution_error',
                    {
                      node_id: '64',
                      node_type: 'SamplerCustomAdvanced',
                      exception_message: 'CUDA out of memory',
                    },
                  ],
                ],
              },
            },
          }),
      },
    ])

    const failure = await runWorkflow(
      'http://127.0.0.1:8188',
      workflow,
      send,
      fakeClock(),
    ).catch((error: unknown) => error)

    expect(failure).toMatchObject({
      code: 'provider-failed',
      details: { provider: 'comfyui', node: '64' },
    })
    expect(String(failure)).toContain('CUDA out of memory')
  })

  it('refuses provider-failed once a prompt stalls past the timeout', async () => {
    const { send } = server([
      queued,
      { path: '/history/p1', answer: () => Response.json({}) },
    ])

    const failure = await runWorkflow('http://127.0.0.1:8188', workflow, send, {
      ...fakeClock(),
      timeoutMs: 5000,
    }).catch((error: unknown) => error)

    expect(failure).toMatchObject({
      code: 'provider-failed',
      details: { provider: 'comfyui', status: null },
    })
    expect(String(failure)).toContain('5 s')
  })

  it('refuses provider-failed when nothing listens at the address', async () => {
    const send = (async () => {
      throw new TypeError('fetch failed')
    }) as typeof fetch

    const failure = await runWorkflow(
      'http://127.0.0.1:8188',
      workflow,
      send,
      fakeClock(),
    ).catch((error: unknown) => error)

    expect(failure).toMatchObject({
      code: 'provider-failed',
      details: { provider: 'comfyui', status: null },
    })
  })

  it('resolves every route under a base with a path and a trailing slash', async () => {
    const { send, asked } = server([
      queued,
      history({
        '9': {
          images: [
            {
              filename: 'frameboard_00001_.png',
              subfolder: '',
              type: 'output',
            },
          ],
        },
      }),
      png,
    ])

    await runWorkflow('http://gpu.lan/comfy/', workflow, send, fakeClock())

    expect(asked.map((each) => new URL(each.url).pathname)).toEqual([
      '/comfy/prompt',
      '/comfy/history/p1',
      '/comfy/view',
    ])
  })
})

describe('freeMemory', () => {
  it('asks the server to unload its models and free their memory', async () => {
    const { send, asked } = server([
      { method: 'POST', path: '/free', answer: () => new Response('') },
    ])

    await freeMemory('http://127.0.0.1:8188', send)

    expect(asked).toEqual([
      {
        method: 'POST',
        url: 'http://127.0.0.1:8188/free',
        body: JSON.stringify({ unload_models: true, free_memory: true }),
      },
    ])
  })

  it('refuses provider-failed when nothing listens', async () => {
    const send = (async () => {
      throw new TypeError('fetch failed')
    }) as typeof fetch

    await expect(
      freeMemory('http://127.0.0.1:8188', send),
    ).rejects.toMatchObject({
      code: 'provider-failed',
      details: { provider: 'comfyui', status: null },
    })
  })
})
