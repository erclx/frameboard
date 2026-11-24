import { afterEach, describe, expect, it, vi } from 'vitest'

import { findFonts } from './sourcing'

/** Records each address the board was asked for, answering an empty search. */
function recordFetch(): string[] {
  const asked: string[] = []
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    asked.push(String(input))
    return Response.json({ ok: true, data: { results: [], total: 0 } })
  })
  return asked
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('findFonts', () => {
  it('asks for a category alone when the text names one', async () => {
    const asked = recordFetch()

    await findFonts('studio', ' Serif ')

    expect(asked).toEqual([
      '/api/projects/studio/sourcing/fonts?category=serif',
    ])
  })

  it('asks by name for any other text', async () => {
    const asked = recordFetch()

    await findFonts('studio', 'serif display')

    expect(asked).toEqual([
      '/api/projects/studio/sourcing/fonts?q=serif+display',
    ])
  })
})
