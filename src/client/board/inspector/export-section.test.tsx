import '../../styles.css'

import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Toaster } from '@/client/components/ui/toast'
import { frameOf } from '@/test/board'

import { ExportSection } from './export-section'
import { exportStore } from './export-store'

const HERO = frameOf('hero', { box: { x: 0, y: 0, width: 400, height: 300 } })
const PHONE = frameOf('phone', {
  box: { x: 0, y: 0, width: 402, height: 874 },
  device: 'phone',
})
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

/** The file names the section lists under its button, one per line. */
function fileLines() {
  return within(screen.getByRole('list', { name: 'Exported files' }))
    .getAllByRole('listitem')
    .map((line) => line.textContent)
}

function png() {
  return Promise.resolve(
    new Response(PNG, { headers: { 'Content-Type': 'image/png' } }),
  )
}

describe('ExportSection', () => {
  beforeEach(() => {
    exportStore.setState({ scale: 2, theme: 'both', device: false })
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
    expect(fileLines()).toEqual(['hero.light@2x.png', 'hero.dark@2x.png'])
  })

  it('names the 1x file once 1x is picked', async () => {
    const user = userEvent.setup()
    render(<ExportSection frame={HERO} />)

    await user.click(screen.getByRole('button', { name: 'Export scale' }))
    await user.click(await screen.findByRole('menuitemradio', { name: '1x' }))

    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())

    expect(fileLines()).toEqual(['hero.light@1x.png', 'hero.dark@1x.png'])
  })

  it('names one file once one theme is picked', async () => {
    const user = userEvent.setup()
    render(<ExportSection frame={HERO} />)

    await user.click(screen.getByRole('button', { name: 'Export theme' }))
    await user.click(await screen.findByRole('menuitemradio', { name: 'Dark' }))

    expect(fileLines()).toEqual(['hero.dark@2x.png'])
    expect(screen.getByRole('button', { name: 'Export 1 file' })).toBeVisible()
  })

  it('fetches each theme at the scale picked, then downloads each file', async () => {
    const user = userEvent.setup()
    const asked = stubFetch(png)
    const downloads = recordDownloads()
    exportStore.setState({ scale: 3 })
    render(<ExportSection frame={HERO} />)

    await user.click(screen.getByRole('button', { name: 'Export 2 files' }))

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

    await user.click(screen.getByRole('button', { name: 'Export 1 file' }))

    const pending = await screen.findByRole('button', { name: 'Exporting' })
    expect(pending).toBeDisabled()
    await act(async () => {
      finish(await png())
    })
    expect(
      await screen.findByRole('button', { name: 'Export 1 file' }),
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

    await user.click(screen.getByRole('button', { name: 'Export 2 files' }))

    expect(
      await screen.findByText('hero uses Brand, which is not installed.'),
    ).toBeVisible()
    expect(downloads).toEqual([])
  })

  describe('Name', () => {
    it('starts as the frame’s name beside the first file’s suffix', () => {
      render(<ExportSection frame={HERO} />)

      expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('hero')
      expect(screen.getByText('.light@2x.png')).toBeVisible()
    })

    it('names every line and every download after what is typed', async () => {
      const user = userEvent.setup()
      stubFetch(png)
      const downloads = recordDownloads()
      render(<ExportSection frame={HERO} />)

      const field = screen.getByRole('textbox', { name: 'Name' })
      await user.clear(field)
      await user.type(field, 'landing')
      await user.click(screen.getByRole('button', { name: 'Export 2 files' }))

      await waitFor(() => expect(downloads).toHaveLength(2))
      expect(fileLines()).toEqual([
        'landing.light@2x.png',
        'landing.dark@2x.png',
      ])
      expect(downloads).toEqual(['landing.light@2x.png', 'landing.dark@2x.png'])
    })

    it('exports under the frame’s name once the field is emptied', async () => {
      const user = userEvent.setup()
      stubFetch(png)
      const downloads = recordDownloads()
      exportStore.setState({ theme: 'light' })
      render(<ExportSection frame={HERO} />)

      await user.clear(screen.getByRole('textbox', { name: 'Name' }))
      await user.click(screen.getByRole('button', { name: 'Export 1 file' }))

      await waitFor(() => expect(downloads).toHaveLength(1))
      expect(downloads).toEqual(['hero.light@2x.png'])
    })

    it('keeps a path separator out of the download’s name', async () => {
      const user = userEvent.setup()
      stubFetch(png)
      const downloads = recordDownloads()
      exportStore.setState({ theme: 'dark' })
      render(<ExportSection frame={HERO} />)

      const field = screen.getByRole('textbox', { name: 'Name' })
      await user.clear(field)
      await user.type(field, '../site/landing')
      await user.click(screen.getByRole('button', { name: 'Export 1 file' }))

      await waitFor(() => expect(downloads).toHaveLength(1))
      expect(downloads).toEqual(['site-landing.dark@2x.png'])
    })

    it('follows a rename while the field is untouched', () => {
      const { rerender } = render(<ExportSection frame={HERO} />)

      rerender(<ExportSection frame={{ ...HERO, name: 'cover' }} />)

      expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('cover')
    })

    it('starts again from the next frame’s name under a new key', async () => {
      const user = userEvent.setup()
      const { rerender } = render(<ExportSection key="hero" frame={HERO} />)
      await user.type(screen.getByRole('textbox', { name: 'Name' }), '-draft')

      rerender(<ExportSection key="phone" frame={PHONE} />)

      expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('phone')
    })
  })

  describe('on an element', () => {
    const TITLE = { index: 4, hash: 'a'.repeat(64), name: 'Page title' }

    it('starts the name from the frame and the element', () => {
      render(<ExportSection frame={HERO} element={TITLE} />)

      expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue(
        'hero-page-title',
      )
    })

    it('asks for the element by its address in every theme', async () => {
      const user = userEvent.setup()
      const asked = stubFetch(png)
      const downloads = recordDownloads()
      render(<ExportSection frame={HERO} element={TITLE} />)

      await user.click(screen.getByRole('button', { name: 'Export 2 files' }))

      await waitFor(() => expect(downloads).toHaveLength(2))
      expect(asked.map((url) => Object.fromEntries(url.searchParams))).toEqual([
        {
          ref: 'studio/home/hero',
          theme: 'light',
          scale: '2',
          element: '4',
          hash: TITLE.hash,
        },
        {
          ref: 'studio/home/hero',
          theme: 'dark',
          scale: '2',
          element: '4',
          hash: TITLE.hash,
        },
      ])
      expect(downloads).toEqual([
        'hero-page-title.light@2x.png',
        'hero-page-title.dark@2x.png',
      ])
    })

    it('shows no device switch on a frame holding a device', () => {
      render(<ExportSection frame={PHONE} element={TITLE} />)

      expect(
        screen.queryByRole('switch', { name: 'Include device' }),
      ).toBeNull()
    })

    it('never asks for the device, whatever the switch was left on', async () => {
      const user = userEvent.setup()
      const asked = stubFetch(png)
      const downloads = recordDownloads()
      exportStore.setState({ theme: 'light', device: true })
      render(<ExportSection frame={PHONE} element={TITLE} />)

      await user.click(screen.getByRole('button', { name: 'Export 1 file' }))

      await waitFor(() => expect(downloads).toHaveLength(1))
      expect(asked.map((url) => url.searchParams.has('device'))).toEqual([
        false,
      ])
    })
  })

  describe('Include device', () => {
    it('shows no switch for a frame holding no device', () => {
      render(<ExportSection frame={HERO} />)

      expect(
        screen.queryByRole('switch', { name: 'Include device' }),
      ).toBeNull()
    })

    it('asks for the device once the switch is on', async () => {
      const user = userEvent.setup()
      const asked = stubFetch(png)
      const downloads = recordDownloads()
      exportStore.setState({ theme: 'light' })
      render(<ExportSection frame={PHONE} />)

      await user.click(screen.getByRole('switch', { name: 'Include device' }))
      await user.click(screen.getByRole('button', { name: 'Export 1 file' }))

      await waitFor(() => expect(downloads).toHaveLength(1))
      expect(asked.map((url) => url.searchParams.get('device'))).toEqual(['1'])
    })

    it('leaves the device out while the switch is off', async () => {
      const user = userEvent.setup()
      const asked = stubFetch(png)
      const downloads = recordDownloads()
      exportStore.setState({ theme: 'light' })
      render(<ExportSection frame={PHONE} />)

      await user.click(screen.getByRole('button', { name: 'Export 1 file' }))

      await waitFor(() => expect(downloads).toHaveLength(1))
      expect(asked.map((url) => url.searchParams.has('device'))).toEqual([
        false,
      ])
    })
  })
})
