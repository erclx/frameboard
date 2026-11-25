import '../../../styles.css'

import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { Toaster } from '@/client/components/ui/toast'
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

import {
  type InstalledFontsRead,
  useInstalledFonts,
} from '../../assets/sourcing'
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

/** A frame read answering these refs for any font. */
function framesOf(frames: string[]): () => Promise<readonly string[]> {
  return async () => frames
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

/** The section over its own read of the installed fonts, as the tab wires it. */
function Fonts({
  load,
  ...props
}: Omit<ComponentProps<typeof FontsSection>, 'list'> & {
  load: InstalledFontsRead
}) {
  return (
    <FontsSection {...props} list={useInstalledFonts(props.project, load)} />
  )
}

function liveBoard(canWrite = true) {
  const board = boardOf(pageOf([frameOf('hero'), frameOf('pricing')]))
  act(() => liveStore.setState({ board, canWrite }))
}

function rowNames(): string[] {
  const list = screen.getByRole('list', { name: 'Fonts frames can use' })
  return within(list)
    .getAllByRole('listitem')
    .map((item) => (item.textContent ?? '').replace(/^Aa/, ''))
}

/** The specimen letters of a family's tile. */
function specimenOf(family: string): HTMLElement {
  const tile = screen.getByText(family).closest('li')
  if (!tile) throw new Error(`No tile for ${family}`)
  return within(tile).getByText('Aa')
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
      render(<Fonts project="studio" load={listOf(installed('Lora'))} />)

      expect(await screen.findByText('Lora')).toBeInTheDocument()
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
      render(<Fonts project="studio" load={listOf()} />)

      expect(await screen.findByText('Caveat')).toBeInTheDocument()
      expect(rowNames()).toHaveLength(5)
      expect(screen.queryByText(/No fonts/)).not.toBeInTheDocument()
    })

    it('lists an installed family the board also serves once, as installed', async () => {
      render(
        <Fonts
          project="studio"
          load={listOf(installed('Inter', { bundled: true }))}
        />,
      )

      await screen.findByRole('button', { name: 'Remove Inter' })
      expect(rowNames().filter((row) => row.startsWith('Inter'))).toEqual([
        expect.stringMatching(/^InterOFL/),
      ])
    })

    it('sets each specimen in its own face', async () => {
      render(<Fonts project="studio" load={listOf(installed('Lora'))} />)

      await screen.findByText('Lora')
      expect(specimenOf('Lora')).toHaveStyle({
        fontFamily: "'Lora', sans-serif",
      })
      expect(specimenOf('Geist Mono')).toHaveStyle({
        fontFamily: "'Geist Mono', monospace",
      })
    })

    it('draws thirty fonts as a grid with no scroll of its own', async () => {
      const families = Array.from({ length: 25 }, (_, at) => `Family ${at}`)
      render(
        <div className="w-[748px]">
          <Fonts
            project="studio"
            load={listOf(...families.map((family) => installed(family)))}
          />
        </div>,
      )

      await screen.findByText('Family 24')
      const list = screen.getByRole('list', { name: 'Fonts frames can use' })
      expect(within(list).getAllByRole('listitem')).toHaveLength(30)
      expect(list.scrollHeight).toBeLessThanOrEqual(list.clientHeight)
      const tops = within(list)
        .getAllByRole('listitem')
        .map((item) => item.getBoundingClientRect().top)
      expect(tops.filter((top) => top === tops[0])).toHaveLength(4)
    })

    it('shows a forty character family whole inside its tile', async () => {
      const family = 'Supercalifragilisticexpialidociousserifs'
      render(
        <div className="w-[320px]">
          <Fonts project="studio" load={listOf(installed(family))} />
        </div>,
      )

      const shown = await screen.findByText(family)
      expect(shown.scrollWidth).toBeLessThanOrEqual(shown.clientWidth)
    })

    it('says the installed list did not load and still lists the built-in faces', async () => {
      render(<Fonts project="studio" load={async () => null} />)

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
        <Fonts
          project="studio"
          load={listOf(installed('Lora'))}
          readFrames={framesOf([])}
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
        <Fonts
          project="studio"
          load={listOf(installed('Lora'))}
          readFrames={framesOf(['studio/home/hero', 'studio/home/pricing'])}
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
        <Fonts
          project="studio"
          load={listOf(installed('Lora'))}
          readFrames={framesOf(['studio/home/hero'])}
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

    it('hands focus back to Remove when the confirmation is cancelled by keyboard', async () => {
      render(
        <Fonts
          project="studio"
          load={listOf(installed('Lora'))}
          readFrames={framesOf(['studio/home/hero'])}
          remove={recordingRemove().remove}
        />,
      )
      const button = await screen.findByRole('button', { name: 'Remove Lora' })
      button.focus()
      await userEvent.keyboard('{Enter}')
      await screen.findByRole('dialog', { name: 'Remove Lora?' })

      await userEvent.keyboard('{Escape}')

      await waitFor(() => expect(button).toHaveFocus())
    })

    it('ignores a second Remove pressed while the first one’s frames read', async () => {
      const asked: string[] = []
      let answer = () => {}
      render(
        <Fonts
          project="studio"
          load={listOf(installed('Lora'), installed('Playfair Display'))}
          readFrames={(_project, id) => {
            asked.push(id)
            return new Promise((resolve) => {
              answer = () => resolve(['studio/home/hero'])
            })
          }}
          remove={recordingRemove().remove}
        />,
      )

      await userEvent.click(
        await screen.findByRole('button', { name: 'Remove Lora' }),
      )
      await userEvent.click(
        screen.getByRole('button', { name: 'Remove Playfair Display' }),
      )
      await act(async () => answer())

      expect(asked).toEqual(['lora'])
      expect(
        await screen.findByRole('dialog', { name: 'Remove Lora?' }),
      ).toBeInTheDocument()
    })

    it('removes a family the board also serves without asking, since its frames keep drawing', async () => {
      const { removed, remove } = recordingRemove()
      render(
        <Fonts
          project="studio"
          load={listOf(installed('Inter', { bundled: true }))}
          readFrames={async () => {
            throw new Error('A family the board serves reads no frames.')
          }}
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
        <Fonts
          project="studio"
          load={listOf(installed('Lora'))}
          readFrames={framesOf([])}
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

    it('reports a removal refused after the section unmounts as a toast', async () => {
      let refuse = () => {}
      render(<Toaster />)
      const { unmount } = render(
        <Fonts
          project="studio"
          load={listOf(installed('Lora'))}
          readFrames={framesOf([])}
          remove={() =>
            new Promise((_resolve, reject) => {
              refuse = () => reject(new Error('The folder is locked.'))
            })
          }
        />,
      )
      await userEvent.click(
        await screen.findByRole('button', { name: 'Remove Lora' }),
      )

      unmount()
      await act(async () => refuse())

      expect(
        await screen.findByText('Couldn’t remove Lora'),
      ).toBeInTheDocument()
    })
  })

  describe('finding and installing', () => {
    it('opens an empty search on Find a font, with nothing found yet', async () => {
      const asked: string[] = []
      render(
        <Fonts
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
        <Fonts
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
        'AaLoraInstalled',
        'AaPlayfair DisplayOFLInstall',
        'AaSource Serif 4Built in',
      ])
      const tile = within(found).getByText('Playfair Display').closest('li')
      expect(
        getComputedStyle(within(tile as HTMLElement).getByText('Aa'))
          .fontFamily,
      ).toMatch(/^"?frameboard-sample-playfair-display"?,/)
      expect(
        within(found).getByRole('button', { name: 'Install Playfair Display' }),
      ).toBeInTheDocument()
      expect(screen.getByText('3 found')).toBeInTheDocument()
    })

    it('counts the matches past the ones shown', async () => {
      render(
        <Fonts
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
        <Fonts
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
        <Fonts
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
        <Fonts
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
      button.focus()
      await userEvent.keyboard('{Enter}')
      await userEvent.keyboard('{Enter}')

      expect(button).toHaveAttribute('aria-disabled', 'true')
      expect(button).toHaveFocus()
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
      expect(screen.getByRole('searchbox')).toHaveFocus()

      await userEvent.keyboard('{Escape}')

      expect(screen.queryByRole('searchbox')).toBeNull()
    })

    it('leaves focus where the person moved it while an install ran', async () => {
      let land = () => {}
      render(
        <>
          <Fonts
            project="studio"
            load={listOf()}
            find={async (_project, text) =>
              findOf(text, [result('Playfair Display')])
            }
            install={(project, id) =>
              new Promise((resolve) => {
                land = () => resolve(savedOf(project, id))
              })
            }
          />
          <input aria-label="Elsewhere" />
        </>,
      )

      await search('playfair')
      await userEvent.click(
        await screen.findByRole('button', { name: 'Install Playfair Display' }),
      )
      const elsewhere = screen.getByRole('textbox', { name: 'Elsewhere' })
      elsewhere.focus()
      await act(async () => land())

      expect(elsewhere).toHaveFocus()
    })

    it('records the query whose answer drew a result, not text typed since', async () => {
      const sent: (string | null)[] = []
      render(
        <Fonts
          project="studio"
          load={listOf()}
          find={async (_project, text) =>
            findOf(text, text === 'play' ? [result('Playfair Display')] : [])
          }
          install={async (project, id, query) => {
            sent.push(query)
            return savedOf(project, id)
          }}
        />,
      )

      await search('play')
      const button = await screen.findByRole('button', {
        name: 'Install Playfair Display',
      })
      await userEvent.type(screen.getByRole('searchbox'), 'x')
      await userEvent.click(button)

      expect(sent).toEqual(['play'])
    })

    it('keeps the field’s name as the found count changes', async () => {
      render(
        <Fonts
          project="studio"
          load={listOf()}
          find={async (_project, text) =>
            findOf(text, [result('Playfair Display')])
          }
        />,
      )

      await search('playfair')
      await screen.findByText('1 found')

      expect(
        screen.getByRole('searchbox', {
          name: 'Search Fontsource by name or category',
        }),
      ).toBeInTheDocument()
    })

    it('reports an install refused after the search closed as a toast', async () => {
      let refuse = () => {}
      render(<Toaster />)
      render(
        <Fonts
          project="studio"
          load={listOf()}
          find={async (_project, text) =>
            findOf(text, [result('Playfair Display')])
          }
          install={() =>
            new Promise((_resolve, reject) => {
              refuse = () => reject(new Error('Fontsource refused the files.'))
            })
          }
        />,
      )

      await search('playfair')
      await userEvent.click(
        await screen.findByRole('button', { name: 'Install Playfair Display' }),
      )
      await userEvent.keyboard('{Escape}')
      await act(async () => refuse())

      expect(
        await screen.findByText('Couldn’t install Playfair Display'),
      ).toBeInTheDocument()
    })

    it('shows a refused install inline', async () => {
      render(
        <Fonts
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
        <Fonts
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
      render(<Fonts project="studio" load={listOf(installed('Lora'))} />)

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
