import { liveStore } from './store'

/** A write the server answered with an error envelope, carrying its code. */
export class BoardWriteError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'BoardWriteError'
    this.code = code
  }
}

type Envelope<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } }

/**
 * The one way the board changes anything on the server: a same-origin JSON
 * request that carries the tab's cookie and no token. Resolves the envelope's
 * `data` and throws a `BoardWriteError` on an error one. A 401 also marks the
 * tab read-only, since its cookie no longer opens the server it reached.
 */
export async function writeBoard<T = unknown>(
  path: string,
  body: unknown,
  method = 'POST',
  send: typeof fetch = fetch,
): Promise<T> {
  const response = await send(path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (response.status === 401) liveStore.setState({ canWrite: false })
  const envelope = (await response
    .json()
    .catch(() => null)) as Envelope<T> | null
  if (envelope === null) {
    throw new BoardWriteError(
      'internal',
      `The board answered ${response.status}.`,
    )
  }
  if (!envelope.ok) {
    throw new BoardWriteError(envelope.error.code, envelope.error.message)
  }
  return envelope.data
}
