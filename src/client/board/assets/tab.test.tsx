import '../../styles.css'

import {
  act,
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { liveStore } from '@/client/live/store'
import type { AssetAddResult, AssetFile } from '@/shared/records/assets'
import { contrastOnPage } from '@/test/contrast'

import { AssetsTab } from './tab'

const FILES: AssetFile[] = [
  { path: 'hero.png', kind: 'image', size: 1_200_000 },
  { path: 'loader.gif', kind: 'gif', size: 240_000 },
  { path: 'Inter.woff2', kind: 'font', size: 98_000 },
  { path: 'demo.mp4', kind: 'video', size: 4_100_000 },
  { path: 'shared.css', kind: 'stylesheet', size: 3_000 },
]

const COUNTED: AssetFile[] = [
  { path: 'brand.woff2', kind: 'font', size: 37_000, frames: 0 },
  { path: 'clip.mp4', kind: 'video', size: 14_000, frames: 1 },
  { path: 'icons/star.svg', kind: 'svg', size: 149, frames: 2 },
  { path: 'logo.svg', kind: 'svg', size: 198, frames: 1 },
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

  describe.each(['light', 'dark'])('in the %s theme', (theme) => {
    beforeEach(() => {
      document.documentElement.classList.toggle('dark', theme === 'dark')
    })

    afterEach(() => {
      document.documentElement.classList.remove('dark')
    })

    it('reads Unused at 4.5:1 or better on the tile', async () => {
      render(<AssetsTab project="studio" load={listing(COUNTED)} />)

      expect(
        contrastOnPage(await screen.findByText('Unused')),
      ).toBeGreaterThanOrEqual(4.5)
    })

    it('reads a tile caption at 4.5:1 or better on the tile', async () => {
      render(<AssetsTab project="studio" load={listing(FILES)} />)

      expect(
        contrastOnPage(await screen.findByText('image · 1.2 MB')),
      ).toBeGreaterThanOrEqual(4.5)
    })
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

  describe('organizing', () => {
    it('groups root files first under assets/, then each folder with its count', async () => {
      render(<AssetsTab project="studio" load={listing(COUNTED)} />)

      const headings = await screen.findAllByRole('heading', { level: 4 })

      expect(headings.map((heading) => heading.textContent)).toEqual([
        'assets/· 3',
        'icons· 1',
      ])
      expect(
        within(screen.getByRole('region', { name: 'icons' })).getByText(
          'star.svg',
        ),
      ).toBeVisible()
    })

    it('names how many frames link each file and Unused for none', async () => {
      render(<AssetsTab project="studio" load={listing(COUNTED)} />)

      expect(await screen.findByText('Unused')).toBeVisible()
      expect(screen.getByText('2 frames')).toBeVisible()
      expect(
        screen.getByRole('button', {
          name: 'Copy path of icons/star.svg, SVG, 149 B, 2 frames',
        }),
      ).toBeVisible()
    })

    it('counts each kind on its chip and hides a chip with no files', async () => {
      render(<AssetsTab project="studio" load={listing(COUNTED)} />)
      const chips = within(
        await screen.findByRole('group', { name: 'Filter by kind' }),
      ).getAllByRole('button')

      expect(chips.map((chip) => chip.textContent)).toEqual([
        'All',
        'Images 2',
        'Video 1',
        'Fonts 1',
      ])
    })

    it('gives each chip a target at least 24px square', async () => {
      render(<AssetsTab project="studio" load={listing(COUNTED)} />)
      const chips = within(
        await screen.findByRole('group', { name: 'Filter by kind' }),
      ).getAllByRole('button')

      const short = chips.filter((chip) => {
        const { width, height } = chip.getBoundingClientRect()
        return width < 24 || height < 24
      })

      expect(short).toEqual([])
    })

    it('shows only the files under a pressed chip', async () => {
      const user = userEvent.setup()
      render(<AssetsTab project="studio" load={listing(COUNTED)} />)

      await user.click(await screen.findByRole('button', { name: 'Fonts 1' }))

      expect(screen.getByRole('button', { name: 'Fonts 1' })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      expect(screen.getByText('brand.woff2')).toBeVisible()
      expect(screen.queryByText('logo.svg')).not.toBeInTheDocument()
    })

    it('narrows the tiles to the paths a search matches', async () => {
      const user = userEvent.setup()
      render(<AssetsTab project="studio" load={listing(COUNTED)} />)

      await user.type(await screen.findByLabelText('Search assets'), 'STAR')

      expect(screen.getByText('star.svg')).toBeVisible()
      expect(screen.queryByText('logo.svg')).not.toBeInTheDocument()
      expect(screen.queryByText('assets/')).not.toBeInTheDocument()
    })

    it('collapses a folder from its heading by keyboard and opens it again', async () => {
      const user = userEvent.setup()
      render(<AssetsTab project="studio" load={listing(COUNTED)} />)
      const heading = await screen.findByRole('button', { name: /^icons/ })

      heading.focus()
      await user.keyboard('{Enter}')

      expect(heading).toHaveAttribute('aria-expanded', 'false')
      expect(screen.queryByText('star.svg')).not.toBeInTheDocument()
      await user.keyboard('{Enter}')
      expect(screen.getByText('star.svg')).toBeVisible()
    })

    it('names a search that matches nothing and clears it', async () => {
      const user = userEvent.setup()
      render(<AssetsTab project="studio" load={listing(COUNTED)} />)
      const search = await screen.findByLabelText('Search assets')

      await user.type(search, 'zebra')

      expect(screen.getByText('No files match "zebra".')).toBeVisible()
      expect(screen.queryByText(/No files in/)).not.toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Clear filter' }))
      expect(search).toHaveValue('')
      expect(screen.getByText('logo.svg')).toBeVisible()
    })

    it('clears both the search and the chip from the no-match state', async () => {
      const user = userEvent.setup()
      render(<AssetsTab project="studio" load={listing(COUNTED)} />)

      await user.click(await screen.findByRole('button', { name: 'Video 1' }))
      await user.type(screen.getByLabelText('Search assets'), 'logo')
      expect(screen.getByText('No video files match "logo".')).toBeVisible()
      await user.click(screen.getByRole('button', { name: 'Clear filter' }))

      expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute(
        'aria-pressed',
        'true',
      )
      expect(screen.getByText('logo.svg')).toBeVisible()
    })
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

    it('lists two refused files with one name as two lines', async () => {
      const refused = {
        name: 'page.html',
        code: 'asset-type-refused',
        message: 'not an accepted type.',
      }
      const upload = async (): Promise<AssetAddResult> => ({
        added: [],
        refused: [refused, refused],
      })
      render(<AssetsTab project="studio" load={listing([])} upload={upload} />)
      const zone = (await screen.findByText('assets/ · 0 files')).closest(
        '[aria-busy]',
      )!

      drag('drop', zone, dropOf(new File(['<p>'], 'page.html')))

      expect(
        await screen.findAllByText('page.html: not an accepted type.'),
      ).toHaveLength(2)
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
