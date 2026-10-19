import '../../styles.css'

import {
  act,
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { liveStore } from '@/client/live/store'
import type { AssetAddResult, AssetFile } from '@/shared/records/assets'

import { AssetsTab } from './tab'

const FILES: AssetFile[] = [
  { path: 'hero.png', kind: 'image', size: 1_200_000 },
  { path: 'loader.gif', kind: 'gif', size: 240_000 },
  { path: 'Inter.woff2', kind: 'font', size: 98_000 },
  { path: 'demo.mp4', kind: 'video', size: 4_100_000 },
  { path: 'shared.css', kind: 'stylesheet', size: 3_000 },
]

const NOTHING: AssetAddResult = { added: [], refused: [] }

function listing(files: AssetFile[]) {
  return async () => ({ files })
}

function dropOf(...files: File[]) {
  const transfer = new DataTransfer()
  for (const file of files) transfer.items.add(file)
  return transfer
}

/** Fires a drag event carrying the transfer itself, since `fireEvent` copies a `DataTransfer` and drops its files. */
function drag(
  type: 'dragOver' | 'drop' | 'dragLeave',
  zone: Element,
  transfer: DataTransfer,
) {
  const event = createEvent[type](zone)
  Object.defineProperty(event, 'dataTransfer', { value: transfer })
  fireEvent(zone, event)
}

beforeEach(() => {
  act(() => liveStore.setState({ canWrite: true }))
})

afterEach(() => {
  act(() => liveStore.setState({ canWrite: false, board: null }))
})

describe('AssetsTab', () => {
  it('counts the files in its header and draws each name with its type and size', async () => {
    render(<AssetsTab project="studio" load={listing(FILES)} />)

    expect(await screen.findByText('assets/ · 5 files')).toBeVisible()
    expect(screen.getByText('image · 1.2 MB')).toBeVisible()
    expect(screen.getByText('GIF · 240 KB')).toBeVisible()
    expect(screen.getByText('font · 98 KB')).toBeVisible()
    expect(screen.getByText('video · 4.1 MB')).toBeVisible()
    expect(screen.getByText('stylesheet · 3 KB')).toBeVisible()
  })

  it('draws an image tile as a lazy thumbnail of the served file', async () => {
    const { container } = render(
      <AssetsTab project="my studio" load={listing(FILES)} />,
    )

    await screen.findByText('assets/ · 5 files')

    const image = container.querySelector('img[src$="hero.png"]')
    expect(image).toHaveAttribute('src', '/frames/my%20studio/assets/hero.png')
    expect(image).toHaveAttribute('loading', 'lazy')
  })

  it('says a one file folder has one file', async () => {
    render(<AssetsTab project="studio" load={listing(FILES.slice(0, 1))} />)

    expect(await screen.findByText('assets/ · 1 file')).toBeVisible()
  })

  it('shows the empty state and the drop hint for a folder with no files', async () => {
    render(<AssetsTab project="studio" load={listing([])} />)

    expect(await screen.findByText('assets/ · 0 files')).toBeVisible()
    expect(screen.getByText(/No files in/)).toBeVisible()
    expect(screen.getByText('Drop files here to add them.')).toBeVisible()
  })

  it('says so when the list does not load', async () => {
    render(<AssetsTab project="studio" load={async () => null} />)

    expect(await screen.findByText(/did not load/)).toBeVisible()
  })

  describe('copying', () => {
    it('copies the path a frame links with each segment encoded and says Copied', async () => {
      const user = userEvent.setup()
      render(
        <AssetsTab
          project="studio"
          load={listing([{ path: 'Hero Image.png', kind: 'image', size: 5 }])}
        />,
      )

      await user.click(
        await screen.findByRole('button', { name: /Copy path of Hero Image/ }),
      )

      expect(await navigator.clipboard.readText()).toBe(
        '../assets/Hero%20Image.png',
      )
      expect(screen.getByText('Copied')).toBeVisible()
    })

    it('says the copy failed when the clipboard refuses', async () => {
      const user = userEvent.setup()
      render(<AssetsTab project="studio" load={listing(FILES.slice(0, 1))} />)
      const refuse = vi
        .spyOn(navigator.clipboard, 'writeText')
        .mockRejectedValue(new Error('denied'))

      await user.click(await screen.findByRole('button', { name: /hero.png/ }))

      expect(await screen.findByText('Copy failed')).toBeVisible()
      expect(screen.queryByText('Copied')).not.toBeInTheDocument()
      refuse.mockRestore()
    })

    it('copies while the tab is read-only', async () => {
      act(() => liveStore.setState({ canWrite: false }))
      const user = userEvent.setup()
      render(<AssetsTab project="studio" load={listing(FILES.slice(0, 1))} />)

      await user.click(await screen.findByRole('button', { name: /hero.png/ }))

      expect(await screen.findByText('Copied')).toBeVisible()
    })
  })

  describe('adding', () => {
    it('posts a dropped file', async () => {
      const upload = vi.fn(async () => NOTHING)
      render(<AssetsTab project="studio" load={listing([])} upload={upload} />)
      const zone = (await screen.findByText('assets/ · 0 files')).closest(
        '[aria-busy]',
      )!
      const file = new File(['x'], 'a.png')

      drag('drop', zone, dropOf(file))

      await waitFor(() => expect(upload).toHaveBeenCalledWith('studio', [file]))
    })

    it('posts the files chosen with the picker', async () => {
      const upload = vi.fn(async () => NOTHING)
      const user = userEvent.setup()
      render(<AssetsTab project="studio" load={listing([])} upload={upload} />)
      await screen.findByText('assets/ · 0 files')
      const file = new File(['x'], 'b.png')

      await user.upload(screen.getByLabelText('Choose files to add'), file)

      await waitFor(() => expect(upload).toHaveBeenCalledWith('studio', [file]))
    })

    it('reads the list again after a drop', async () => {
      const load = vi.fn(listing([]))
      render(
        <AssetsTab project="studio" load={load} upload={async () => NOTHING} />,
      )
      const zone = (await screen.findByText('assets/ · 0 files')).closest(
        '[aria-busy]',
      )!

      drag('drop', zone, dropOf(new File(['x'], 'a.png')))

      await waitFor(() => expect(load).toHaveBeenCalledTimes(2))
    })

    it('names each refused file in the refusal line', async () => {
      const upload = async (): Promise<AssetAddResult> => ({
        added: [],
        refused: [
          {
            name: 'page.html',
            code: 'asset-type-refused',
            message: 'page.html is not an accepted type.',
          },
        ],
      })
      render(<AssetsTab project="studio" load={listing([])} upload={upload} />)
      const zone = (await screen.findByText('assets/ · 0 files')).closest(
        '[aria-busy]',
      )!

      drag('drop', zone, dropOf(new File(['<p>'], 'page.html')))

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'page.html: page.html is not an accepted type.',
      )
    })

    it('shows the error of a drop the server refused and stays usable', async () => {
      const upload = async (): Promise<AssetAddResult> => {
        throw new Error('A drop may carry 64 MiB at most. Nothing was written.')
      }
      render(
        <AssetsTab project="studio" load={listing(FILES)} upload={upload} />,
      )
      const zone = (await screen.findByText('assets/ · 5 files')).closest(
        '[aria-busy]',
      )!

      drag('drop', zone, dropOf(new File(['x'], 'a.png')))

      expect(await screen.findByRole('alert')).toHaveTextContent('64 MiB')
      expect(screen.getByText('assets/ · 5 files')).toBeVisible()
    })

    it('posts nothing from a drag that carries no files', async () => {
      const upload = vi.fn(async () => NOTHING)
      render(<AssetsTab project="studio" load={listing([])} upload={upload} />)
      const zone = (await screen.findByText('assets/ · 0 files')).closest(
        '[aria-busy]',
      )!
      const layer = new DataTransfer()
      layer.setData('text/plain', 'layer-row')

      drag('dragOver', zone, layer)
      drag('drop', zone, layer)

      expect(zone.className).not.toContain('ring-primary')
      expect(upload).not.toHaveBeenCalled()
    })

    it('highlights while files are dragged over and clears on leave', async () => {
      render(<AssetsTab project="studio" load={listing([])} />)
      const zone = (await screen.findByText('assets/ · 0 files')).closest(
        '[aria-busy]',
      )!

      drag('dragOver', zone, dropOf(new File(['x'], 'a.png')))
      expect(zone.className).toContain('ring-primary')

      fireEvent.dragLeave(zone)
      expect(zone.className).not.toContain('ring-primary')
    })

    it('posts nothing from a read-only tab and says why', async () => {
      act(() => liveStore.setState({ canWrite: false }))
      const upload = vi.fn(async () => NOTHING)
      render(<AssetsTab project="studio" load={listing([])} upload={upload} />)
      const zone = (await screen.findByText('assets/ · 0 files')).closest(
        '[aria-busy]',
      )!

      drag('drop', zone, dropOf(new File(['x'], 'a.png')))

      expect(upload).not.toHaveBeenCalled()
      expect(screen.getByRole('button', { name: 'Add files' })).toBeDisabled()
      expect(screen.getByText(/read-only/)).toBeVisible()
    })
  })
})
