import { beforeEach, describe, expect, it } from 'vitest'

import { liveStore } from './store'
import { BoardWriteError, writeBoard } from './write'

function answering(status: number, body: unknown): typeof fetch {
  return async () => Response.json(body, { status })
}

describe('writeBoard', () => {
  beforeEach(() => {
    liveStore.setState({ canWrite: true })
  })

  it('posts the body as JSON and resolves the envelope data', async () => {
    const seen: { path: string; init: RequestInit | undefined }[] = []
    const send: typeof fetch = async (path, init) => {
      seen.push({ path: String(path), init })
      return Response.json({ ok: true, data: { opened: true } })
    }

    const data = await writeBoard('/api/open', { a: 1 }, 'POST', send)

    expect(data).toEqual({ opened: true })
    expect(seen).toHaveLength(1)
    expect(seen[0]?.path).toBe('/api/open')
    expect(seen[0]?.init).toMatchObject({
      method: 'POST',
      body: '{"a":1}',
      headers: { 'content-type': 'application/json' },
    })
    expect(liveStore.getState().canWrite).toBe(true)
  })

  it('sends a FormData body as given with no content-type header', async () => {
    const form = new FormData()
    form.append('files', new File(['x'], 'a.png'))
    let init: RequestInit | undefined
    const send: typeof fetch = async (_path, sent) => {
      init = sent
      return Response.json({ ok: true, data: null })
    }

    await writeBoard('/api/projects/p/assets', form, 'POST', send)

    expect(init?.body).toBe(form)
    expect(init?.headers).toBeUndefined()
  })

  it('uses the method it is given', async () => {
    let method = ''
    const send: typeof fetch = async (_path, init) => {
      method = init?.method ?? ''
      return Response.json({ ok: true, data: null })
    }

    await writeBoard('/api/thing', {}, 'DELETE', send)

    expect(method).toBe('DELETE')
  })

  it('marks the tab read-only on a 401 and throws the error', async () => {
    const send = answering(401, {
      ok: false,
      error: { code: 'unauthorized', message: 'Writes need the board key.' },
    })

    await expect(
      writeBoard('/api/open', {}, 'POST', send),
    ).rejects.toMatchObject({
      code: 'unauthorized',
      message: 'Writes need the board key.',
    })
    expect(liveStore.getState().canWrite).toBe(false)
  })

  it('throws an error envelope and keeps the tab writing on another status', async () => {
    const send = answering(400, {
      ok: false,
      error: { code: 'usage', message: 'Send a ref.' },
    })

    const failure = writeBoard('/api/show', {}, 'POST', send)

    await expect(failure).rejects.toBeInstanceOf(BoardWriteError)
    await expect(failure).rejects.toMatchObject({ code: 'usage' })
    expect(liveStore.getState().canWrite).toBe(true)
  })

  it('throws when the answer is not an envelope', async () => {
    const send: typeof fetch = async () =>
      new Response('bad gateway', { status: 502 })

    await expect(
      writeBoard('/api/open', {}, 'POST', send),
    ).rejects.toMatchObject({
      code: 'internal',
    })
  })
})
