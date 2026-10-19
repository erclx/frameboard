import { FrameboardError } from '@/shared/errors'
import type { AddressFile } from '@/shared/records/address'

/** How long a running server has to answer before the verb gives up on it. */
const REQUEST_TIMEOUT_MS = 500

/**
 * Posts to a running board server's write route with the address file's
 * token, resolving the `data` of its envelope.
 */
export function postToBoard(
  address: AddressFile,
  path: string,
  body: unknown,
): Promise<unknown> {
  return requestBoard(address, path, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${address.token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

/** Reads a running board server's route, resolving the `data` of its envelope. */
export function getFromBoard(
  address: AddressFile,
  path: string,
): Promise<unknown> {
  return requestBoard(address, path, { method: 'GET' })
}

async function requestBoard(
  address: AddressFile,
  path: string,
  init: RequestInit,
): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(`${address.url}${path}`, {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (error) {
    throw new FrameboardError(
      'server-not-running',
      `The frameboard server at ${address.url} did not answer. Run frameboard serve to restart it.`,
      { url: address.url },
      { cause: error },
    )
  }
  const envelope = (await response.json().catch(() => null)) as {
    data?: unknown
  } | null
  if (!response.ok || !envelope) {
    throw new FrameboardError(
      'internal',
      `The frameboard server at ${address.url} refused ${path} with ${response.status}.`,
      { url: address.url, status: response.status },
    )
  }
  return envelope.data
}
