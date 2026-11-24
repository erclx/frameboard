import { afterEach, describe, expect, it, vi } from 'vitest'

import { fetchFontFrames, fetchInstalledFonts, findFonts } from './sourcing'

/** Records each address the board was asked for, answering `data` to every one. */
function recordFetch(data: unknown = { results: [], total: 0 }): string[] {
  const asked: string[] = []
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    asked.push(String(input))
    return Response.json({ ok: true, data })
  })
  return asked
}

describe('installed font reads', () => {
  it('lists the installed fonts without reading their frames', async () => {
    const asked = recordFetch({ version: 1, project: 'studio', fonts: [] })

    await fetchInstalledFonts('studio')

    expect(asked).toEqual([
      '/api/projects/studio/sourcing/fonts/installed?frames=false',
    ])
  })

  it('reads one font’s frames from the full list as a removal asks', async () => {
    recordFetch({
      version: 1,
      project: 'studio',
      fonts: [
        { id: 'lora', frames: ['studio/home/hero'] },
        { id: 'inter', frames: ['studio/home/about'] },
      ],
    })

    expect(await fetchFontFrames('studio', 'lora')).toEqual([
      'studio/home/hero',
    ])
  })
})

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
