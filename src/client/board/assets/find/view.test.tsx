import '../../../styles.css'

import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { liveStore } from '@/client/live/store'
import { BoardWriteError } from '@/client/live/write'
import type {
  ImageFind,
  ImageResult,
  ModelFind,
  ModelResult,
  SavedImage,
} from '@/shared/records/sourcing'

import { resetSaves, saveResult } from '../sourcing'
import { resetSearches } from './search-store'
import { FindView } from './view'

function result(id: string, overrides: Partial<ImageResult> = {}): ImageResult {
  return {
    number: 1,
    id,
    title: `Photo ${id}`,
    creator: 'Ann',
    creatorUrl: null,
    license: 'cc0',
    licenseVersion: '1.0',
    licenseUrl: null,
    attribution: null,
    landingUrl: `https://www.flickr.com/photos/${id}`,
    url: `https://images.example.org/${id}.jpg`,
    thumbnail: null,
    width: 1024,
    height: 768,
    ...overrides,
  }
}

function answer(
  query: string,
  results: ImageResult[],
  credited = false,
): ImageFind {
  return {
    version: 1,
    query,
    licenses: credited ? ['cc0', 'pdm', 'by'] : ['cc0', 'pdm'],
    results,
  }
}

function model(id: string, overrides: Partial<ModelResult> = {}): ModelResult {
  return {
    number: 1,
    id,
    name: 'Sofa 02',
    authors: ['Ann'],
    categories: ['seating'],
    tags: ['chair'],
    license: 'cc0',
    landingUrl: `https://polyhaven.com/a/${id}`,
    thumbnail: `https://cdn.polyhaven.com/asset_img/thumbs/${id}.png`,
    polycount: 10946,
    dimensionsMm: null,
    sizes: ['1k', '2k'],
    downloadCount: 1,
    ...overrides,
  }
}

function modelAnswer(query: string, results: ModelResult[]): ModelFind {
  return {
    version: 1,
    query,
    source: { name: 'Poly Haven', url: 'https://polyhaven.com' },
    results,
  }
}

function saved(path: string): SavedImage {
  return {
    version: 1,
    project: 'webapp',
    path,
    licensePath: `${path}.license.json`,
    license: {
      version: 1,
      origin: 'found',
      source: 'openverse',
      id: 'a1',
      query: 'house',
      title: null,
      creator: null,
      creatorUrl: null,
      license: 'cc0',
      licenseVersion: null,
      licenseUrl: null,
      attribution: null,
      landingUrl: null,
      url: 'https://images.example.org/a1.jpg',
      savedAt: '2026-11-18T12:00:00.000Z',
    },
  }
}

async function searchFor(query: string) {
  const user = userEvent.setup()
  await user.type(
    screen.getByRole('searchbox', { name: 'Search free images' }),
    `${query}{Enter}`,
  )
  return user
}

beforeEach(() => {
  act(() => liveStore.setState({ canWrite: true }))
})

afterEach(() => {
  resetSaves()
  resetSearches()
})

describe('FindView', () => {
  it('waits for a search before asking anything, saying where a saved result lands', () => {
    const find = vi.fn()

    render(<FindView project="webapp" find={find} />)

    expect(screen.getByText(/A result you save lands in/)).toBeInTheDocument()
    expect(find).not.toHaveBeenCalled()
  })

  it('holds the grid with grey tiles while a search runs', async () => {
    render(<FindView project="webapp" find={() => new Promise(() => {})} />)

    await searchFor('modern house')

    expect(
      within(screen.getByRole('list', { name: 'Searching' })).getAllByRole(
        'listitem',
      ),
    ).toHaveLength(4)
    expect(screen.getByText('Searching Openverse')).toBeInTheDocument()
  })

  it('lists each result with its license, size, and site, and counts them', async () => {
    render(
      <FindView
        project="webapp"
        find={async (_, query) =>
          answer(query, [result('a1'), result('b2', { license: 'pdm' })])
        }
      />,
    )

    await searchFor('modern house')

    const tiles = within(
      await screen.findByRole('list', { name: 'Results' }),
    ).getAllByRole('listitem')
    expect(tiles).toHaveLength(2)
    expect(tiles[0]).toHaveTextContent('Photo a1')
    expect(tiles[0]).toHaveTextContent('1024 × 768 · Flickr')
    expect(tiles[1]).toHaveTextContent('pdm')
    expect(
      screen.getByText('2 public domain images from Openverse'),
    ).toBeInTheDocument()
  })

  it('ends a result line too long for its tile in an ellipsis, with the full line as its title', async () => {
    const meta = '5334 × 3772 · Rawpixel'
    render(
      <div className="w-[240px]">
        <FindView
          project="webapp"
          find={async (_, query) =>
            answer(query, [
              result('a1', {
                width: 5334,
                height: 3772,
                landingUrl: 'https://www.rawpixel.com/image/a1',
              }),
            ])
          }
        />
      </div>,
    )

    await searchFor('paper texture')

    const line = await screen.findByText(meta)
    expect(line).toHaveAttribute('title', meta)
    expect(getComputedStyle(line).textOverflow).toBe('ellipsis')
    expect(line.scrollWidth).toBeGreaterThan(line.clientWidth)
  })

  it('says nothing matched and widens to credited licenses from the same line', async () => {
    const find = vi.fn(async (_: string, query: string) => answer(query, []))
    render(<FindView project="webapp" find={find} />)
    const user = await searchFor('zebra crossing at night')

    await user.click(
      await screen.findByRole('button', { name: 'include credited licenses' }),
    )

    expect(find).toHaveBeenLastCalledWith(
      'webapp',
      'zebra crossing at night',
      true,
      expect.any(AbortSignal),
    )
    await user.click(screen.getByRole('button', { name: 'Filter: Images' }))
    expect(
      await screen.findByRole('menuitemcheckbox', {
        name: 'Include credited licenses',
      }),
    ).toBeChecked()
  })

  it('names Openverse not answering and searches again from the line', async () => {
    const find = vi
      .fn()
      .mockRejectedValueOnce(
        new BoardWriteError('source-failed', 'down', { status: null }),
      )
      .mockResolvedValueOnce(answer('house', [result('a1')]))
    render(<FindView project="webapp" find={find} />)
    const user = await searchFor('house')

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Openverse did not answer')
    await user.click(
      within(alert).getByRole('button', { name: 'search again' }),
    )

    expect(
      await screen.findByRole('list', { name: 'Results' }),
    ).toBeInTheDocument()
    expect(find).toHaveBeenCalledTimes(2)
  })

  it('paints the failure line in the destructive color, with the source line under it', async () => {
    render(
      <FindView
        project="webapp"
        find={() =>
          Promise.reject(
            new BoardWriteError('source-failed', 'down', { status: null }),
          )
        }
      />,
    )
    const destructive = document.createElement('span')
    destructive.className = 'text-destructive'
    document.body.append(destructive)

    await searchFor('house')

    const alert = await screen.findByRole('alert')
    expect(getComputedStyle(alert).color).toBe(
      getComputedStyle(destructive).color,
    )
    expect(screen.getByText('Images from Openverse')).toBeInTheDocument()
    destructive.remove()
  })

  it('names the status Openverse refused with', async () => {
    render(
      <FindView
        project="webapp"
        find={() =>
          Promise.reject(
            new BoardWriteError('source-failed', 'limited', { status: 429 }),
          )
        }
      />,
    )

    await searchFor('house')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Openverse answered 429',
    )
  })

  it('searches again with credited licenses when the menu turns them on, and says a credit is owed', async () => {
    const find = vi.fn(async (_: string, query: string, credited: boolean) =>
      answer(
        query,
        [result('a1', { license: credited ? 'by' : 'cc0' })],
        credited,
      ),
    )
    render(<FindView project="webapp" find={find} />)
    const user = await searchFor('house')
    await screen.findByRole('list', { name: 'Results' })

    await user.click(screen.getByRole('button', { name: 'Filter: Images' }))
    await user.click(
      await screen.findByRole('menuitemcheckbox', {
        name: 'Include credited licenses',
      }),
    )

    await waitFor(() =>
      expect(screen.getByRole('list', { name: 'Results' })).toHaveTextContent(
        'by',
      ),
    )
    expect(find).toHaveBeenLastCalledWith(
      'webapp',
      'house',
      true,
      expect.any(AbortSignal),
    )
    expect(
      screen.getByText(/must be credited where you use it/),
    ).toBeInTheDocument()
  })

  it('never lets an older answer replace a newer one', async () => {
    let answerFirst = (_: ImageFind) => {}
    const find = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise<ImageFind>((done) => (answerFirst = done)),
      )
      .mockImplementationOnce(async () => answer('cabin', [result('newer')]))
    render(<FindView project="webapp" find={find} />)
    const user = await searchFor('house')
    const field = screen.getByRole('searchbox', { name: 'Search free images' })

    await user.clear(field)
    await user.type(field, 'cabin{Enter}')
    await screen.findByText('Photo newer')
    act(() => answerFirst(answer('house', [result('older')])))

    expect(screen.queryByText('Photo older')).not.toBeInTheDocument()
    expect(screen.getByText('Photo newer')).toBeInTheDocument()
  })

  describe('after leaving the tab', () => {
    it('shows the last query, its results, and each Saved mark on return', async () => {
      const find = vi.fn(async (_: string, query: string) =>
        answer(query, [result('a1'), result('b2')]),
      )
      const save = (request: Parameters<typeof saveResult>[0]) =>
        saveResult(
          request,
          async () => saved('house.jpg'),
          async () => true,
        )
      const first = render(
        <FindView project="webapp" find={find} save={save} />,
      )
      const user = await searchFor('house')
      await user.click(
        await screen.findByRole('button', { name: 'Save Photo a1' }),
      )
      await screen.findByRole('button', { name: 'Saved Photo a1' })

      first.unmount()
      render(<FindView project="webapp" find={find} save={save} />)

      expect(
        screen.getByRole('searchbox', { name: 'Search free images' }),
      ).toHaveValue('house')
      expect(
        screen.getByRole('button', { name: 'Saved Photo a1' }),
      ).toBeVisible()
      expect(
        screen.getByRole('button', { name: 'Save Photo b2' }),
      ).toBeInTheDocument()
      expect(find).toHaveBeenCalledTimes(1)
    })

    it('lands a search still running when the tab closed', async () => {
      let land = (_: ImageFind) => {}
      const find = vi.fn(() => new Promise<ImageFind>((done) => (land = done)))
      const first = render(<FindView project="webapp" find={find} />)
      await searchFor('house')

      first.unmount()
      await act(async () => land(answer('house', [result('a1')])))
      render(<FindView project="webapp" find={find} />)

      expect(screen.getByText('Photo a1')).toBeInTheDocument()
    })

    it('keeps Models picked, with its results', async () => {
      const findModels = vi.fn(async (_: string, query: string) =>
        modelAnswer(query, [model('sofa_02')]),
      )
      const first = render(
        <FindView
          project="webapp"
          find={async (_, query) => answer(query, [result('a1')])}
          findModels={findModels}
        />,
      )
      const user = await searchFor('chair')
      await screen.findByText('Photo a1')
      await user.click(screen.getByRole('button', { name: 'Filter: Images' }))
      await user.click(
        await screen.findByRole('menuitemradio', { name: 'Models' }),
      )
      await screen.findByText('Sofa 02')

      first.unmount()
      render(
        <FindView project="webapp" find={vi.fn()} findModels={findModels} />,
      )

      expect(
        screen.getByRole('button', { name: 'Filter: Models' }),
      ).toBeInTheDocument()
      expect(screen.getByText('Sofa 02')).toBeInTheDocument()
    })

    it('starts another project empty', async () => {
      const first = render(
        <FindView
          project="webapp"
          find={async (_, query) => answer(query, [result('a1')])}
        />,
      )
      await searchFor('house')
      await screen.findByText('Photo a1')

      first.unmount()
      render(<FindView project="mobile" find={vi.fn()} />)

      expect(
        screen.getByRole('searchbox', { name: 'Search free images' }),
      ).toHaveValue('')
      expect(screen.getByText(/A result you save lands in/)).toBeInTheDocument()
    })
  })

  it('saves a result once however fast Save is pressed, then marks it Saved', async () => {
    let land = (_: SavedImage) => {}
    const send = vi.fn(() => new Promise<SavedImage>((done) => (land = done)))
    render(
      <FindView
        project="webapp"
        find={async (_, query) => answer(query, [result('a1')])}
        save={(request) => saveResult(request, send, async () => true)}
      />,
    )
    const user = await searchFor('house')
    const save = await screen.findByRole('button', { name: 'Save Photo a1' })

    await user.click(save)
    await user.click(save)
    act(() => land(saved('house.jpg')))
    await user.click(
      await screen.findByRole('button', { name: 'Saved Photo a1' }),
    )

    expect(screen.getByRole('button', { name: 'Saved Photo a1' })).toBeVisible()
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith('/api/projects/webapp/sourcing/save', {
      id: 'a1',
      query: 'house',
      credited: false,
    })
  })

  it('saves again once the saved file is gone from assets', async () => {
    const send = vi.fn(async () => saved('house.jpg'))
    let present = true
    render(
      <FindView
        project="webapp"
        find={async (_, query) => answer(query, [result('a1')])}
        save={(request) => saveResult(request, send, async () => present)}
      />,
    )
    const user = await searchFor('house')
    await user.click(
      await screen.findByRole('button', { name: 'Save Photo a1' }),
    )
    const marked = await screen.findByRole('button', { name: 'Saved Photo a1' })

    present = false
    await user.click(marked)

    await waitFor(() => expect(send).toHaveBeenCalledTimes(2))
  })

  it('names a failed save under the grid and lets it be saved again', async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error('The image host answered 500.'))
    render(
      <FindView
        project="webapp"
        find={async (_, query) => answer(query, [result('a1')])}
        save={(request) => saveResult(request, send)}
      />,
    )
    const user = await searchFor('house')

    await user.click(
      await screen.findByRole('button', { name: 'Save Photo a1' }),
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Photo a1: The image host answered 500.',
    )
    expect(
      screen.getByRole('button', { name: 'Save again Photo a1' }),
    ).toBeEnabled()
  })

  it('lists results in a read-only tab with Save off and the reason', async () => {
    act(() => liveStore.setState({ canWrite: false }))
    render(
      <FindView
        project="webapp"
        find={async (_, query) => answer(query, [result('a1')])}
      />,
    )

    await searchFor('house')

    expect(await screen.findByText('Photo a1')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /Save/ }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByText(/This tab is read-only, so results cannot be saved/),
    ).toBeInTheDocument()
  })

  describe('on Models', () => {
    async function pickModels(user: ReturnType<typeof userEvent.setup>) {
      await user.click(screen.getByRole('button', { name: 'Filter: Images' }))
      await user.click(
        await screen.findByRole('menuitemradio', { name: 'Models' }),
      )
    }

    it('names Poly Haven before a search and asks nothing yet', async () => {
      const findModels = vi.fn()
      const user = userEvent.setup()
      render(
        <FindView project="webapp" find={vi.fn()} findModels={findModels} />,
      )

      await pickModels(user)

      expect(screen.getByText('Models from Poly Haven')).toBeInTheDocument()
      expect(
        screen.getByRole('searchbox', { name: 'Search free models' }),
      ).toBeInTheDocument()
      expect(findModels).not.toHaveBeenCalled()
    })

    it('searches the typed query again for models, listing each with its polycount and Poly Haven', async () => {
      const find = vi.fn(async (_: string, query: string) =>
        answer(query, [result('a1')]),
      )
      const findModels = vi.fn(async (_: string, query: string) =>
        modelAnswer(query, [model('sofa_02', { polycount: 2728 })]),
      )
      render(<FindView project="webapp" find={find} findModels={findModels} />)
      const user = await searchFor('chair')
      await screen.findByText('Photo a1')

      await pickModels(user)

      const tiles = within(
        await screen.findByRole('list', { name: 'Results' }),
      ).getAllByRole('listitem')
      expect(tiles).toHaveLength(1)
      expect(tiles[0]).toHaveTextContent('Sofa 02')
      expect(tiles[0]).toHaveTextContent('2.7k tris · Poly Haven')
      expect(findModels).toHaveBeenCalledWith(
        'webapp',
        'chair',
        expect.any(AbortSignal),
      )
      expect(screen.getByText('1 model from Poly Haven')).toBeInTheDocument()
    })

    it('greys out the credited choice with the reason every model is CC0', async () => {
      const user = userEvent.setup()
      render(<FindView project="webapp" find={vi.fn()} findModels={vi.fn()} />)
      await pickModels(user)

      await user.click(screen.getByRole('button', { name: 'Filter: Models' }))

      const credited = await screen.findByRole('menuitemcheckbox', {
        name: 'Include credited licenses',
      })
      expect(credited).toHaveAttribute('aria-disabled', 'true')
      expect(credited).toHaveAccessibleDescription(
        'Every Poly Haven model is CC0.',
      )
      expect(
        screen.getByRole('menuitemradio', { name: 'Models' }),
      ).toBeChecked()
    })

    it('saves a model once through the model route, then marks it Saved', async () => {
      const send = vi.fn(async () => saved('chair.glb'))
      render(
        <FindView
          project="webapp"
          find={vi.fn()}
          findModels={async (_, query) =>
            modelAnswer(query, [model('sofa_02')])
          }
          save={(request) => saveResult(request, send, async () => true)}
        />,
      )
      const user = userEvent.setup()
      await pickModels(user)
      await user.type(
        screen.getByRole('searchbox', { name: 'Search free models' }),
        'chair{Enter}',
      )
      const save = await screen.findByRole('button', { name: 'Save Sofa 02' })

      await user.click(save)
      await user.click(save)

      expect(
        await screen.findByRole('button', { name: 'Saved Sofa 02' }),
      ).toBeVisible()
      expect(send).toHaveBeenCalledTimes(1)
      expect(send).toHaveBeenCalledWith(
        '/api/projects/webapp/sourcing/models/save',
        { id: 'sofa_02', query: 'chair' },
      )
    })

    it('draws a grey block for a model with no thumbnail, never a broken image', async () => {
      render(
        <FindView
          project="webapp"
          find={vi.fn()}
          findModels={async (_, query) =>
            modelAnswer(query, [model('sofa_02', { thumbnail: null })])
          }
        />,
      )
      const user = userEvent.setup()
      await pickModels(user)
      await user.type(
        screen.getByRole('searchbox', { name: 'Search free models' }),
        'chair{Enter}',
      )

      const tile = await screen.findByRole('listitem')

      expect(tile.querySelector('img')).toBeNull()
    })

    it('lists models in a read-only tab with Save off', async () => {
      act(() => liveStore.setState({ canWrite: false }))
      render(
        <FindView
          project="webapp"
          find={vi.fn()}
          findModels={async (_, query) =>
            modelAnswer(query, [model('sofa_02')])
          }
        />,
      )
      const user = userEvent.setup()
      await pickModels(user)
      await user.type(
        screen.getByRole('searchbox', { name: 'Search free models' }),
        'chair{Enter}',
      )

      expect(await screen.findByText('Sofa 02')).toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: /Save/ }),
      ).not.toBeInTheDocument()
    })

    it('names Poly Haven not answering', async () => {
      render(
        <FindView
          project="webapp"
          find={vi.fn()}
          findModels={() =>
            Promise.reject(
              new BoardWriteError('source-failed', 'down', { status: 503 }),
            )
          }
        />,
      )
      const user = userEvent.setup()
      await pickModels(user)
      await user.type(
        screen.getByRole('searchbox', { name: 'Search free models' }),
        'chair{Enter}',
      )

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Poly Haven answered 503',
      )
    })
  })

  it('holds the kind and the license choice in the search field, with no rows of controls under it', () => {
    render(<FindView project="webapp" find={vi.fn()} />)

    const search = screen.getByRole('search')

    expect(
      within(search).getByRole('button', { name: 'Filter: Images' }),
    ).toBeVisible()
    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
    expect(
      screen.queryByRole('group', { name: 'What to find' }),
    ).not.toBeInTheDocument()
  })
})
