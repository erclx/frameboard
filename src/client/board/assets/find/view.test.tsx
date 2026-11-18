import '../../../styles.css'

import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { liveStore } from '@/client/live/store'
import { BoardWriteError } from '@/client/live/write'
import type {
  ImageFind,
  ImageResult,
  SavedImage,
} from '@/shared/records/sourcing'

import { resetSaves, saveResult } from '../sourcing'
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
    expect(
      screen.getByRole('switch', { name: 'Include credited licenses' }),
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

  it('searches again with credited licenses when the switch turns on, and says a credit is owed', async () => {
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

    await user.click(
      screen.getByRole('switch', { name: 'Include credited licenses' }),
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

  it('saves a result once however fast Save is pressed, then marks it Saved', async () => {
    let land = (_: SavedImage) => {}
    const send = vi.fn(() => new Promise<SavedImage>((done) => (land = done)))
    render(
      <FindView
        project="webapp"
        find={async (_, query) => answer(query, [result('a1')])}
        save={(request) => saveResult(request, send)}
      />,
    )
    const user = await searchFor('house')
    const save = await screen.findByRole('button', { name: 'Save Photo a1' })

    await user.click(save)
    await user.click(save)
    act(() => land(saved('house.jpg')))

    expect(
      await screen.findByRole('button', { name: 'Saved Photo a1' }),
    ).toBeDisabled()
    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith('/api/projects/webapp/sourcing/save', {
      id: 'a1',
      query: 'house',
      credited: false,
    })
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

  it('keeps Models off with the line saying when they arrive', () => {
    render(<FindView project="webapp" find={vi.fn()} />)

    const models = screen.getByRole('button', { name: 'Models' })
    expect(models).toBeDisabled()
    expect(models).toHaveAccessibleDescription(
      '3D models arrive in a later release.',
    )
  })
})
