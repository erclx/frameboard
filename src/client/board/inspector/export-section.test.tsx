import '../../styles.css'

import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Toaster } from '@/client/components/ui/toast'
import { frameOf } from '@/test/board'

import { ExportSection } from './export-section'
import { exportStore } from './export-store'

const HERO = frameOf('hero', { box: { x: 0, y: 0, width: 400, height: 300 } })
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47])

/** Records each PNG request the section sends, answering each with `answer`. */
function stubFetch(answer: (url: URL) => Promise<Response>) {
  const asked: URL[] = []
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const url = new URL(String(input), location.href)
    asked.push(url)
    return answer(url)
  })
  return asked
}

/** Records the file name of every download the section starts, starting none. */
function recordDownloads() {
  const names: string[] = []
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    names.push(this.download)
  })
  return names
}

function png() {
  return Promise.resolve(
    new Response(PNG, { headers: { 'Content-Type': 'image/png' } }),
  )
}

describe('ExportSection', () => {
  beforeEach(() => {
    exportStore.setState({ scale: 2, theme: 'both' })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('opens on 2x and both themes, naming both files', () => {
    render(<ExportSection frame={HERO} />)

    expect(
      screen.getByRole('button', { name: 'Export scale' }),
    ).toHaveTextContent('2x')
    expect(
      screen.getByRole('button', { name: 'Export theme' }),
    ).toHaveTextContent('Both themes')
    expect(
      screen.getByText('PNG, hero.light@2x.png and hero.dark@2x.png'),
    ).toBeVisible()
  })

  it('names the 1x file once 1x is picked', async () => {
    const user = userEvent.setup()
    render(<ExportSection frame={HERO} />)

    await user.click(screen.getByRole('button', { name: 'Export scale' }))
    await user.click(await screen.findByRole('menuitemradio', { name: '1x' }))

    expect(
      screen.getByText('PNG, hero.light@1x.png and hero.dark@1x.png'),
    ).toBeVisible()
  })

  it('names one file once one theme is picked', async () => {
    const user = userEvent.setup()
    render(<ExportSection frame={HERO} />)

    await user.click(screen.getByRole('button', { name: 'Export theme' }))
    await user.click(await screen.findByRole('menuitemradio', { name: 'Dark' }))

    expect(screen.getByText('PNG, hero.dark@2x.png')).toBeVisible()
  })

  it('fetches each theme at the scale picked, then downloads each file', async () => {
    const user = userEvent.setup()
    const asked = stubFetch(png)
    const downloads = recordDownloads()
    exportStore.setState({ scale: 3 })
    render(<ExportSection frame={HERO} />)

    await user.click(screen.getByRole('button', { name: 'Export hero' }))

    await waitFor(() => expect(downloads).toHaveLength(2))
    expect(asked.map((url) => url.pathname)).toEqual([
      '/api/frames/png',
      '/api/frames/png',
    ])
    expect(asked.map((url) => Object.fromEntries(url.searchParams))).toEqual([
      { ref: 'studio/home/hero', theme: 'light', scale: '3' },
      { ref: 'studio/home/hero', theme: 'dark', scale: '3' },
    ])
    expect(downloads).toEqual(['hero.light@3x.png', 'hero.dark@3x.png'])
  })

  it('reads Exporting and refuses a second press while the images render', async () => {
    const user = userEvent.setup()
    let finish: (response: Response) => void = () => {}
    stubFetch(
      () =>
        new Promise<Response>((resolve) => {
          finish = resolve
        }),
    )
    recordDownloads()
    exportStore.setState({ theme: 'light' })
    render(<ExportSection frame={HERO} />)

    await user.click(screen.getByRole('button', { name: 'Export hero' }))

    const pending = await screen.findByRole('button', { name: 'Exporting' })
    expect(pending).toBeDisabled()
    await act(async () => {
      finish(await png())
    })
    expect(
      await screen.findByRole('button', { name: 'Export hero' }),
    ).toBeEnabled()
  })

  it('toasts the board’s message and downloads nothing when one theme refuses', async () => {
    const user = userEvent.setup()
    stubFetch((url) =>
      url.searchParams.get('theme') === 'dark'
        ? Promise.resolve(
            Response.json(
              {
                ok: false,
                error: {
                  code: 'font-missing',
                  message: 'hero uses Brand, which is not installed.',
                },
              },
              { status: 422 },
            ),
          )
        : png(),
    )
    const downloads = recordDownloads()
    render(
      <>
        <Toaster />
        <ExportSection frame={HERO} />
      </>,
    )

    await user.click(screen.getByRole('button', { name: 'Export hero' }))

    expect(
      await screen.findByText('hero uses Brand, which is not installed.'),
    ).toBeVisible()
    expect(downloads).toEqual([])
  })
})
