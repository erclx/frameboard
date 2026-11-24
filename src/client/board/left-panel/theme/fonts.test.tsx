import '../../../styles.css'

import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { liveStore } from '@/client/live/store'
import { BoardWriteError } from '@/client/live/write'
import type {
  FontFind,
  FontList,
  FontRemove,
  FontResult,
  InstalledFont,
  SavedFont,
} from '@/shared/records/sourcing'
import { boardOf, frameOf, pageOf } from '@/test/board'

import { FontsSection } from './fonts'

function installed(
  family: string,
  extra: Partial<InstalledFont> = {},
): InstalledFont {
  const id = family.toLowerCase().replaceAll(' ', '-')
  return {
    id,
    family,
    category: 'serif',
    license: 'OFL-1.1',
    licenseUrl: `https://example.test/${id}/license`,
    landingUrl: `https://fontsource.org/fonts/${id}`,
    variable: true,
    weights: [{ min: 400, max: 700 }],
    styles: ['normal'],
    path: `fonts/${id}`,
    files: 2,
    bundled: false,
    frames: [],
    ...extra,
  }
}

function result(family: string): FontResult {
  const id = family.toLowerCase().replaceAll(' ', '-')
  return {
    number: 1,
    id,
    family,
    category: 'serif',
    license: 'OFL-1.1',
    variable: true,
    weights: [400, 700],
    styles: ['normal'],
    subsets: ['latin'],
    landingUrl: `https://fontsource.org/fonts/${id}`,
    sample: `https://cdn.example.test/${id}/latin-400-normal.woff2`,
  }
}

function findOf(text: string, results: FontResult[]): FontFind {
  return {
    version: 1,
    query: text,
    category: null,
    licenses: ['OFL-1.1', 'Apache-2.0', 'UFL-1.0'],
    source: { name: 'Fontsource', url: 'https://fontsource.org' },
    total: results.length,
    results,
  }
}

function savedOf(project: string, id: string): SavedFont {
  return {
    version: 1,
    project,
    path: `fonts/${id}`,
    licensePath: `fonts/${id}/font.license.json`,
    license: {
      version: 1,
      origin: 'found',
      source: 'fontsource',
      id,
      query: null,
      family: id,
      category: 'serif',
      license: 'OFL-1.1',
      licenseUrl: `https://example.test/${id}/license`,
      licenseFile: 'LICENSE.txt',
      landingUrl: `https://fontsource.org/fonts/${id}`,
      url: `https://cdn.example.test/${id}`,
      variable: true,
      faces: [
        {
          file: 'latin-wght-normal.woff2',
          style: 'normal',
          weights: { min: 400, max: 700 },
          unicodeRange: null,
        },
      ],
      savedAt: '2026-11-24T00:00:00.000Z',
    },
  }
}

async function search(text: string) {
  await userEvent.click(
    await screen.findByRole('button', { name: 'Find a font' }),
  )
  await userEvent.type(screen.getByRole('searchbox'), text)
}

function listOf(...fonts: InstalledFont[]): () => Promise<FontList> {
  return async () => ({ version: 1, project: 'studio', fonts })
}

/** A removal recording each id it was asked for, answering as the route does. */
function recordingRemove() {
  const removed: string[] = []
  const remove = async (project: string, id: string): Promise<FontRemove> => {
    removed.push(id)
    return { version: 1, project, id, family: id, frames: [] }
  }
  return { removed, remove }
}

function liveBoard(canWrite = true) {
  const board = boardOf(pageOf([frameOf('hero'), frameOf('pricing')]))
  act(() => liveStore.setState({ board, canWrite }))
}

function rowNames(): string[] {
  const list = screen.getByRole('list', { name: 'Fonts frames can use' })
  return within(list)
    .getAllByRole('listitem')
    .map((item) => item.textContent ?? '')
}

beforeEach(() => {
  liveBoard()
})

afterEach(() => {
  act(() => liveStore.setState({ board: null, canWrite: false }))
})

describe('FontsSection', () => {
  describe('the list', () => {
    it('lists the built-in faces then each installed family with its license', async () => {
      render(<FontsSection project="studio" load={listOf(installed('Lora'))} />)

      expect(await screen.findByText('Lora')).toBeInTheDocument()
      expect(
        within(screen.getByRole('region', { name: 'Fonts' })).getByText('6'),
      ).toBeInTheDocument()
      expect(rowNames()).toEqual([
        'GeistBuilt in',
        'Geist MonoBuilt in',
        'InterBuilt in',
        'Source Serif 4Built in',
        'CaveatBuilt in',
        expect.stringMatching(/^LoraOFL/),
      ])
    })

    it('lists the built-in faces alone, with no empty message, before anything is installed', async () => {
      render(<FontsSection project="studio" load={listOf()} />)

      expect(await screen.findByText('Caveat')).toBeInTheDocument()
      expect(rowNames()).toHaveLength(5)
      expect(screen.queryByText(/No fonts/)).not.toBeInTheDocument()
    })

    it('lists an installed family the board also serves once, as installed', async () => {
      render(
        <FontsSection
          project="studio"
          load={listOf(installed('Inter', { bundled: true }))}
        />,
      )

      await screen.findByRole('button', { name: 'Remove Inter' })
      expect(rowNames().filter((row) => row.startsWith('Inter'))).toEqual([
        expect.stringMatching(/^InterOFL/),
      ])
    })

    it('sets each row in its own face', async () => {
      render(<FontsSection project="studio" load={listOf(installed('Lora'))} />)

      expect(await screen.findByText('Lora')).toHaveStyle({
        fontFamily: "'Lora', sans-serif",
      })
      expect(screen.getByText('Geist Mono')).toHaveStyle({
        fontFamily: "'Geist Mono', monospace",
      })
    })

    it('says the installed list did not load and still lists the built-in faces', async () => {
      render(<FontsSection project="studio" load={async () => null} />)

      expect(
        await screen.findByText(
          'The installed fonts did not load. Reload the board to try again.',
        ),
      ).toBeInTheDocument()
      expect(rowNames()).toHaveLength(5)
    })
  })

  describe('removing', () => {
    it('removes a family no frame uses without asking', async () => {
      const { removed, remove } = recordingRemove()
      render(
        <FontsSection
          project="studio"
          load={listOf(installed('Lora'))}
          remove={remove}
        />,
      )

      await userEvent.click(
        await screen.findByRole('button', { name: 'Remove Lora' }),
      )

      expect(removed).toEqual(['lora'])
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('asks first, naming the frames a removal leaves falling back', async () => {
      const { removed, remove } = recordingRemove()
      render(
        <FontsSection
          project="studio"
          load={listOf(
            installed('Lora', {
              frames: ['studio/home/hero', 'studio/home/pricing'],
            }),
          )}
          remove={remove}
        />,
      )

      await userEvent.click(
        await screen.findByRole('button', { name: 'Remove Lora' }),
      )
      const dialog = await screen.findByRole('dialog', {
        name: 'Remove Lora?',
      })

      expect(dialog).toHaveTextContent(
        'The 2 frames using it fall back to another face: hero, pricing.',
      )
      expect(removed).toEqual([])

      await userEvent.click(
        within(dialog).getByRole('button', { name: 'Remove' }),
      )

      expect(removed).toEqual(['lora'])
    })

    it('keeps the font when the confirmation is cancelled', async () => {
      const { removed, remove } = recordingRemove()
      render(
        <FontsSection
          project="studio"
          load={listOf(installed('Lora', { frames: ['studio/home/hero'] }))}
          remove={remove}
        />,
      )

      await userEvent.click(
        await screen.findByRole('button', { name: 'Remove Lora' }),
      )
      await userEvent.click(
        within(await screen.findByRole('dialog')).getByRole('button', {
          name: 'Cancel',
        }),
      )

      expect(removed).toEqual([])
    })

    it('removes a family the board also serves without asking, since its frames keep drawing', async () => {
      const { removed, remove } = recordingRemove()
      render(
        <FontsSection
          project="studio"
          load={listOf(
            installed('Inter', { bundled: true, frames: ['studio/home/hero'] }),
          )}
          remove={remove}
        />,
      )

      await userEvent.click(
        await screen.findByRole('button', { name: 'Remove Inter' }),
      )

      expect(removed).toEqual(['inter'])
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('shows a refused removal inline', async () => {
      render(
        <FontsSection
          project="studio"
          load={listOf(installed('Lora'))}
          remove={async () => {
            throw new Error('The folder is locked.')
          }}
        />,
      )

      await userEvent.click(
        await screen.findByRole('button', { name: 'Remove Lora' }),
      )

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Couldn’t remove Lora. The folder is locked.',
      )
    })
  })

  describe('finding and installing', () => {
    it('opens an empty search on Find a font, with nothing found yet', async () => {
      const asked: string[] = []
      render(
        <FontsSection
          project="studio"
          load={listOf()}
          find={async (_project, text) => {
            asked.push(text)
            return findOf(text, [])
          }}
        />,
      )

      await userEvent.click(
        await screen.findByRole('button', { name: 'Find a font' }),
      )

      expect(
        screen.getByRole('searchbox', {
          name: 'Search Fontsource by name or category',
        }),
      ).toHaveFocus()
      expect(screen.queryByRole('list', { name: 'Fonts found' })).toBeNull()
      expect(asked).toEqual([])
    })

    it('lists what a search found, each set in its sample, with Install named for its family', async () => {
      render(
        <FontsSection
          project="studio"
          load={listOf(installed('Lora'))}
          find={async (_project, text) =>
            findOf(text, [
              result('Lora'),
              result('Playfair Display'),
              result('Source Serif 4'),
            ])
          }
        />,
      )

      await search('serif')

      const found = await screen.findByRole('list', { name: 'Fonts found' })
      expect(
        within(found)
          .getAllByRole('listitem')
          .map((item) => item.textContent),
      ).toEqual([
        'LoraInstalled',
        'Playfair DisplayOFLInstall',
        'Source Serif 4Built in',
      ])
      expect(
        getComputedStyle(within(found).getByText('Playfair Display'))
          .fontFamily,
      ).toMatch(/^"?frameboard-sample-playfair-display"?,/)
      expect(
        within(found).getByRole('button', { name: 'Install Playfair Display' }),
      ).toBeInTheDocument()
      expect(screen.getByText('3 found')).toBeInTheDocument()
    })

    it('counts the matches past the ones shown', async () => {
      render(
        <FontsSection
          project="studio"
          load={listOf()}
          find={async (_project, text) => ({
            ...findOf(text, [result('Lora')]),
            total: 63,
          })}
        />,
      )

      await search('sans')

      expect(
        await screen.findByText(
          'Showing the first 1 of 63. Type more of a name to narrow them.',
        ),
      ).toBeInTheDocument()
    })

    it('says nothing matched and how to widen the search', async () => {
      render(
        <FontsSection
          project="studio"
          load={listOf()}
          find={async (_project, text) => findOf(text, [])}
        />,
      )

      await search('zzz')

      expect(
        await screen.findByText(
          'Nothing matched “zzz”. Try part of a name, or a category such as serif or monospace.',
        ),
      ).toBeInTheDocument()
    })

    it('names the source when it does not answer, and keeps the installed list', async () => {
      render(
        <FontsSection
          project="studio"
          load={listOf(installed('Lora'))}
          find={async () => {
            throw new BoardWriteError('source-failed', 'fetch failed')
          }}
        />,
      )

      await search('lora')

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Fontsource didn’t answer, so nothing can be found right now. Check the connection and search again.',
      )
      expect(rowNames()).toContainEqual(expect.stringMatching(/^LoraOFL/))
    })

    it('installs a result once while it runs, then lists it as installed', async () => {
      const sent: { id: string; query: string | null }[] = []
      let land = () => {}
      let fonts: InstalledFont[] = []
      render(
        <FontsSection
          project="studio"
          load={async () => ({ version: 1, project: 'studio', fonts })}
          find={async (_project, text) =>
            findOf(text, [result('Playfair Display')])
          }
          install={(project, id, query) => {
            sent.push({ id, query })
            return new Promise((resolve) => {
              land = () => resolve(savedOf(project, id))
            })
          }}
        />,
      )

      await search('playfair')
      const button = await screen.findByRole('button', {
        name: 'Install Playfair Display',
      })
      await userEvent.click(button)

      expect(button).toBeDisabled()
      expect(screen.getByText('Installing')).toBeInTheDocument()

      fonts = [installed('Playfair Display')]
      await act(async () => land())
      liveBoard()

      expect(
        await screen.findByRole('button', { name: 'Remove Playfair Display' }),
      ).toBeInTheDocument()
      expect(
        within(screen.getByRole('list', { name: 'Fonts found' })).getByText(
          'Installed',
        ),
      ).toBeInTheDocument()
      expect(sent).toEqual([{ id: 'playfair-display', query: 'playfair' }])
    })

    it('shows a refused install inline', async () => {
      render(
        <FontsSection
          project="studio"
          load={listOf()}
          find={async (_project, text) =>
            findOf(text, [result('Playfair Display')])
          }
          install={async () => {
            throw new BoardWriteError(
              'name-taken',
              'A hand-filled folder already holds fonts/playfair-display.',
            )
          }}
        />,
      )

      await search('playfair')
      await userEvent.click(
        await screen.findByRole('button', { name: 'Install Playfair Display' }),
      )

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Couldn’t install Playfair Display. A hand-filled folder already holds fonts/playfair-display.',
      )
    })

    it('closes the search on Escape and returns focus to Find a font', async () => {
      render(
        <FontsSection
          project="studio"
          load={listOf()}
          find={async (_project, text) => findOf(text, [])}
        />,
      )

      await search('lora')
      await userEvent.keyboard('{Escape}')

      expect(screen.queryByRole('searchbox')).toBeNull()
      expect(screen.getByRole('button', { name: 'Find a font' })).toHaveFocus()
    })
  })

  describe('a view-only tab', () => {
    it('lists the fonts with no remove, saying why', async () => {
      liveBoard(false)
      render(<FontsSection project="studio" load={listOf(installed('Lora'))} />)

      expect(await screen.findByText('Lora')).toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: 'Remove Lora' }),
      ).not.toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: 'Find a font' }),
      ).not.toBeInTheDocument()
      expect(
        screen.getByText('View only, so fonts can’t be added or removed here.'),
      ).toBeInTheDocument()
    })
  })
})
