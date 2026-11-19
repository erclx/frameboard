import { FrameboardError } from '@/shared/errors'

import { type ImageBytes, imageExtension } from '../save'
import type { Workflow } from './workflow'

/**
 * How long a prompt may sit unfinished before the run gives up. A first call
 * loads the model for 20 seconds or more, so this bounds a stalled queue
 * rather than a slow start.
 */
export const RUN_TIMEOUT_MS = 10 * 60 * 1000

/** How often a run reads the prompt's history while it waits. */
export const POLL_MS = 500

/** The clock a run waits on, passed in so a test moves it without real time. */
export interface RunClock {
  now: () => number
  wait: (ms: number) => Promise<void>
  timeoutMs?: number
}

const realClock: RunClock = {
  now: () => Date.now(),
  wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}

/**
 * A route under the server's address, keeping any path the address carries,
 * so `http://host/comfy/` reaches `http://host/comfy/prompt`.
 */
export function routeOf(base: string, route: string): string {
  return `${base.replace(/\/+$/, '')}/${route}`
}

/**
 * Queues the workflow, waits for it to finish, and reads its first saved
 * image. Refuses `provider-failed` naming the node ComfyUI refused or failed
 * in, and on a prompt still unfinished at the clock's timeout.
 */
export async function runWorkflow(
  base: string,
  workflow: Workflow,
  send: typeof fetch,
  clock: RunClock = realClock,
): Promise<ImageBytes> {
  const outputs = await runPrompt(base, workflow, send, clock)
  return readImage(base, firstSavedImage(outputs), send)
}

/**
 * Queues the workflow, waits for it to finish, and reads the first GLB a save
 * node wrote, ignoring any later one. Refuses `provider-failed` as
 * `runWorkflow` does, and when the run saved no GLB.
 */
export async function runModelWorkflow(
  base: string,
  workflow: Workflow,
  send: typeof fetch,
  clock: RunClock = realClock,
): Promise<Uint8Array> {
  const outputs = await runPrompt(base, workflow, send, clock)
  const file = firstSavedModel(outputs)
  const answer = await call(send, viewUrl(base, file))
  if (!answer.ok) {
    throw failed(answer.status, `could not serve ${file.filename}`)
  }
  return new Uint8Array(await answer.arrayBuffer())
}

/** A picture to hand the server, named by the file name it is stored under. */
export interface Upload {
  name: string
  bytes: Uint8Array
}

/**
 * Hands a picture to the server through its own upload, answering the name a
 * `LoadImage` node reads it by. The server may store it under another name,
 * so a run takes the answered name rather than the one sent.
 */
export async function uploadImage(
  base: string,
  upload: Upload,
  send: typeof fetch,
): Promise<string> {
  const form = new FormData()
  // Copied, since a Blob refuses a view that may sit on a SharedArrayBuffer.
  form.append('image', new Blob([upload.bytes.slice()]), upload.name)
  const answer = await call(send, routeOf(base, 'upload/image'), {
    method: 'POST',
    body: form,
  })
  if (!answer.ok) {
    throw failed(answer.status, `refused the upload of ${upload.name}`)
  }
  const body: unknown = await answer.json().catch(() => null)
  const name = field(body, 'name')
  if (typeof name !== 'string' || name === '') {
    throw failed(answer.status, 'took the upload but answered no name')
  }
  const subfolder = field(body, 'subfolder')
  return typeof subfolder === 'string' && subfolder !== ''
    ? `${subfolder}/${name}`
    : name
}

/** Queues the workflow and waits for it to finish, answering the outputs its history records. */
async function runPrompt(
  base: string,
  workflow: Workflow,
  send: typeof fetch,
  clock: RunClock,
): Promise<unknown> {
  const queued = await call(send, routeOf(base, 'prompt'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow }),
  })
  const body: unknown = await queued.json().catch(() => null)
  if (!queued.ok) throw refused(queued.status, body)
  const id = field(body, 'prompt_id')
  if (typeof id !== 'string') {
    throw failed(queued.status, 'queued the prompt but answered no prompt_id')
  }

  const timeoutMs = clock.timeoutMs ?? RUN_TIMEOUT_MS
  const deadline = clock.now() + timeoutMs
  for (;;) {
    const answer = await call(send, routeOf(base, `history/${id}`))
    const entry = field(await answer.json().catch(() => null), id)
    const status = field(entry, 'status')
    if (field(status, 'status_str') === 'error') throw runFailed(status)
    if (field(status, 'completed') === true) return field(entry, 'outputs')
    if (clock.now() >= deadline) {
      throw failed(
        null,
        `prompt ${id} did not finish in ${timeoutMs / 1000} s, so the queue looks stalled`,
      )
    }
    await clock.wait(POLL_MS)
  }
}

/** Asks the server to unload every model and free its memory, which the next run loads again. */
export async function freeMemory(
  base: string,
  send: typeof fetch,
): Promise<void> {
  const answer = await call(send, routeOf(base, 'free'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ unload_models: true, free_memory: true }),
  })
  if (!answer.ok) throw failed(answer.status, 'refused to free its memory')
}

async function call(
  send: typeof fetch,
  url: string,
  init?: RequestInit,
): Promise<Response> {
  try {
    return await send(url, init)
  } catch (error) {
    throw failed(null, `nothing answered at ${url}: ${String(error)}`)
  }
}

interface SavedFile {
  filename: string
  subfolder: string
  type: string
}

/** The first image a save node wrote, skipping the temporary ones a preview node shows. */
function firstSavedImage(outputs: unknown): SavedFile {
  const nodes =
    typeof outputs === 'object' && outputs !== null
      ? Object.values(outputs)
      : []
  for (const node of nodes) {
    const images = field(node, 'images')
    for (const image of Array.isArray(images) ? images : []) {
      const filename = field(image, 'filename')
      if (typeof filename === 'string' && field(image, 'type') === 'output') {
        const subfolder = field(image, 'subfolder')
        return {
          filename,
          subfolder: typeof subfolder === 'string' ? subfolder : '',
          type: 'output',
        }
      }
    }
  }
  throw failed(200, 'the run finished and saved no image')
}

/** The first GLB a save node wrote, which ComfyUI lists under a node's `3d` output. */
function firstSavedModel(outputs: unknown): SavedFile {
  const nodes =
    typeof outputs === 'object' && outputs !== null
      ? Object.values(outputs)
      : []
  for (const node of nodes) {
    const files = field(node, '3d')
    for (const file of Array.isArray(files) ? files : []) {
      const filename = field(file, 'filename')
      if (
        typeof filename === 'string' &&
        filename.toLowerCase().endsWith('.glb') &&
        field(file, 'type') === 'output'
      ) {
        const subfolder = field(file, 'subfolder')
        return {
          filename,
          subfolder: typeof subfolder === 'string' ? subfolder : '',
          type: 'output',
        }
      }
    }
  }
  throw failed(200, 'the run finished and saved no GLB')
}

/** Where `/view` serves a saved file, which it answers as it is unless a `channel` asks for one. */
function viewUrl(base: string, file: SavedFile): string {
  const query = new URLSearchParams({
    filename: file.filename,
    subfolder: file.subfolder,
    type: file.type,
  })
  return `${routeOf(base, 'view')}?${query}`
}

async function readImage(
  base: string,
  file: SavedFile,
  send: typeof fetch,
): Promise<ImageBytes> {
  const answer = await call(send, viewUrl(base, file))
  if (!answer.ok) {
    throw failed(answer.status, `could not serve ${file.filename}`)
  }
  const extension =
    imageExtension(answer.headers.get('content-type'), null) ??
    imageExtension(null, new URL(file.filename, 'file:///').href)
  if (extension === null) {
    throw failed(answer.status, `${file.filename} is not an image`)
  }
  return { bytes: new Uint8Array(await answer.arrayBuffer()), extension }
}

/** The refusal `/prompt` answers, naming the first node it found at fault and why. */
function refused(status: number, body: unknown): FrameboardError {
  const nodeErrors = field(body, 'node_errors')
  const [node, fault] =
    typeof nodeErrors === 'object' && nodeErrors !== null
      ? (Object.entries(nodeErrors)[0] ?? [])
      : []
  const message = String(field(field(body, 'error'), 'message') ?? 'refused')
  if (node === undefined) return failed(status, message)
  const errors = field(fault, 'errors')
  const first: unknown = Array.isArray(errors) ? errors[0] : undefined
  const reason = [field(first, 'message'), field(first, 'details')]
    .filter((each) => typeof each === 'string' && each !== '')
    .join(', ')
  return failed(
    status,
    `node ${node} ${String(field(fault, 'class_type') ?? '')}: ${reason || message}`,
    node,
  )
}

/** The failure a finished run's history records, naming the node it failed in. */
function runFailed(status: unknown): FrameboardError {
  const messages = field(status, 'messages')
  const error = (Array.isArray(messages) ? messages : []).find(
    (each: unknown) => Array.isArray(each) && each[0] === 'execution_error',
  ) as unknown[] | undefined
  const detail = error?.[1]
  const node = field(detail, 'node_id')
  return failed(
    200,
    `node ${String(node ?? '?')} ${String(field(detail, 'node_type') ?? '')}: ${String(field(detail, 'exception_message') ?? 'the run failed')}`,
    typeof node === 'string' ? node : undefined,
  )
}

function failed(
  status: number | null,
  reason: string,
  node?: string,
): FrameboardError {
  return new FrameboardError(
    'provider-failed',
    `comfyui ${status === null ? 'did not answer' : `answered ${status}`}: ${reason.slice(0, 300)}`,
    node === undefined
      ? { provider: 'comfyui', status }
      : { provider: 'comfyui', status, node },
  )
}

function field(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null && key in value
    ? (value as Record<string, unknown>)[key]
    : undefined
}
