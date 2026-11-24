import '../../../styles.css'

import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { liveStore } from '@/client/live/store'
import type {
  FontList,
  FontRemove,
  InstalledFont,
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

      expect(await screen.findByText('1 installed')).toBeInTheDocument()
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
      expect(screen.queryByText(/installed/)).not.toBeInTheDocument()
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

  describe('a view-only tab', () => {
    it('lists the fonts with no remove, saying why', async () => {
      liveBoard(false)
      render(<FontsSection project="studio" load={listOf(installed('Lora'))} />)

      expect(await screen.findByText('Lora')).toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: 'Remove Lora' }),
      ).not.toBeInTheDocument()
      expect(
        screen.getByText('View only, so fonts can’t be added or removed here.'),
      ).toBeInTheDocument()
    })
  })
})
