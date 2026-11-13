import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import type { PreviewStart } from '@/shared/records/preview'
import { frameOf } from '@/test/board'

import { PhoneLink } from './phone-link'

const HERO = frameOf('hero')

function linkFor(token: string): PreviewStart {
  return {
    url: `http://192.168.1.24:4400/v/${token}/frames/${HERO.ref}.html`,
    address: '192.168.1.24',
    port: 4400,
    token,
    project: 'studio',
    ref: HERO.ref,
  }
}

function ok(data: unknown): Response {
  return Response.json({ ok: true, data })
}

/**
 * A board that answers each start with the next token and records every
 * request, standing in for the server's preview route.
 */
function fakeBoard(answerStart?: () => Promise<Response>) {
  const requests: { method: string; body: unknown }[] = []
  let started = 0
  const send: typeof fetch = async (_input, init) => {
    const method = init?.method ?? 'GET'
    requests.push({ method, body: JSON.parse(String(init?.body ?? 'null')) })
    if (method === 'DELETE') return ok({ stopped: true })
    started += 1
    return answerStart ? answerStart() : ok(linkFor(`token-${started}`))
  }
  return { send, requests }
}

describe('PhoneLink', () => {
  it('opens a card showing the code, the link, and what it covers', async () => {
    const { send, requests } = fakeBoard()
    render(<PhoneLink frame={HERO} disabled={false} send={send} />)

    await userEvent.click(
      screen.getByRole('button', { name: 'Open on a phone' }),
    )

    const url = linkFor('token-1').url
    expect(
      await screen.findByRole('img', { name: `Code for ${url}` }),
    ).toBeInTheDocument()
    expect(screen.getByText(url)).toBeInTheDocument()
    expect(
      screen.getByText(/The link opens studio read only/),
    ).toBeInTheDocument()
    expect(requests).toEqual([{ method: 'POST', body: { ref: HERO.ref } }])
  })

  it('ends the link it started when the card closes', async () => {
    const { send, requests } = fakeBoard()
    render(<PhoneLink frame={HERO} disabled={false} send={send} />)
    await userEvent.click(
      screen.getByRole('button', { name: 'Open on a phone' }),
    )
    await screen.findByRole('img', { name: /^Code for/ })

    await userEvent.keyboard('{Escape}')

    await waitFor(() =>
      expect(requests.at(-1)).toEqual({
        method: 'DELETE',
        body: { token: 'token-1' },
      }),
    )
  })

  it('ends the link on a keepalive request when the tab leaves with the card open', async () => {
    const leaving: RequestInit[] = []
    const { send: board } = fakeBoard()
    const send: typeof fetch = (input, init) => {
      if (init?.keepalive) leaving.push(init)
      return board(input, init)
    }
    render(<PhoneLink frame={HERO} disabled={false} send={send} />)
    await userEvent.click(
      screen.getByRole('button', { name: 'Open on a phone' }),
    )
    await screen.findByRole('img', { name: /^Code for/ })

    window.dispatchEvent(new PageTransitionEvent('pagehide'))

    expect(leaving).toHaveLength(1)
    expect(leaving[0]?.method).toBe('DELETE')
    expect(JSON.parse(String(leaving[0]?.body))).toEqual({ token: 'token-1' })
  })

  it('ends a link whose start answers after the card closed', async () => {
    let answer: (response: Response) => void = () => undefined
    const { send, requests } = fakeBoard(
      () => new Promise((resolve) => (answer = resolve)),
    )
    render(<PhoneLink frame={HERO} disabled={false} send={send} />)
    await userEvent.click(
      screen.getByRole('button', { name: 'Open on a phone' }),
    )
    await screen.findByRole('status')

    await userEvent.keyboard('{Escape}')
    answer(ok(linkFor('late-token')))

    await waitFor(() =>
      expect(requests.at(-1)).toEqual({
        method: 'DELETE',
        body: { token: 'late-token' },
      }),
    )
  })

  it('says how to fix a machine on no local network, and tries again on request', async () => {
    const { send, requests } = fakeBoard(async () =>
      Response.json(
        {
          ok: false,
          error: {
            code: 'no-network-address',
            message: 'No address',
            details: {},
          },
        },
        { status: 503 },
      ),
    )
    render(<PhoneLink frame={HERO} disabled={false} send={send} />)
    await userEvent.click(
      screen.getByRole('button', { name: 'Open on a phone' }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Join the Wi-Fi the phone is on',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))

    await waitFor(() =>
      expect(requests.filter(({ method }) => method === 'POST')).toHaveLength(
        2,
      ),
    )
  })

  it('cannot start a link from a tab that cannot write', () => {
    const { send } = fakeBoard()
    render(<PhoneLink frame={HERO} disabled send={send} />)

    expect(
      screen.getByRole('button', { name: 'Open on a phone' }),
    ).toBeDisabled()
  })
})
