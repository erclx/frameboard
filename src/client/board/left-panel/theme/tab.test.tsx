import '../../../styles.css'

import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { liveStore } from '@/client/live/store'
import type { ProjectKitRecord } from '@/shared/records/list'
import type { FontList, InstalledFont } from '@/shared/records/sourcing'
import type { TokenRow, TokenTable } from '@/shared/records/tokens'
import { boardOf, frameOf, pageOf } from '@/test/board'
import { contrastOnPage } from '@/test/contrast'
import { contrastHovered } from '@/test/hover-contrast'

import { closeTheme, themeDialogStore } from './dialog-store'
import { ThemeTab } from './tab'

function row(name: string, extra: Partial<TokenRow> = {}): TokenRow {
  return {
    name,
    group: 'color',
    light: '#111111',
    dark: '#eeeeee',
    sheet: 'tokens.css',
    overrides: false,
    ...extra,
  }
}

function table(
  tokens: TokenRow[],
  extra: Partial<TokenTable> = {},
): TokenTable {
  return {
    sheets: [{ path: 'tokens.css', kind: 'board', error: null, hash: 'h' }],
    tokens,
    ...extra,
  }
}

function installed(family: string): InstalledFont {
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
  }
}

const MIXED = table([
  row('--primary'),
  row('--accent'),
  row('--radius-sm', { group: 'radius', light: '4px', dark: '4px' }),
  row('--font-text', { group: 'font', light: 'Geist', dark: 'Geist' }),
  row('--space', { group: 'other', light: '16px', dark: '16px' }),
])

interface Read {
  tokens?: TokenTable | null
  fonts?: InstalledFont[] | null
}

function renderTab({ tokens = MIXED, fonts = [] }: Read = {}) {
  const load = async () => tokens
  const list: FontList | null = fonts && {
    version: 1,
    project: 'studio',
    fonts,
  }
  const loadFonts = async () => list
  return render(<ThemeTab project="studio" load={load} loadFonts={loadFonts} />)
}

function liveBoard(kits: ProjectKitRecord[] = [], canWrite = true) {
  const board = boardOf(pageOf([frameOf('hero')]))
  const [project] = board.projects
  if (project) project.kits = kits
  act(() => liveStore.setState({ board, canWrite }))
}

function card(title: string) {
  return screen.findByRole('button', { name: new RegExp(`^${title}`) })
}

beforeEach(() => {
  liveBoard()
})

afterEach(() => {
  act(() => {
    closeTheme()
    liveStore.setState({ board: null, canWrite: false })
  })
})

describe('ThemeTab', () => {
  describe('the cards', () => {
    it('sum up what each part holds', async () => {
      liveBoard([{ name: 'sketch', title: 'Sketch', frameCount: 1 }])
      renderTab({ fonts: [installed('Lora')] })

      expect(await card('Kits · 1')).toHaveTextContent('Sketch')
      expect(await card('Fonts · 6')).toHaveTextContent('Lora')
      expect(await card('Colors · 2')).toBeInTheDocument()
      expect(await card('Radius, type, other · 3')).toBeInTheDocument()
    })

    it('set each font name in its own face', async () => {
      renderTab({ fonts: [installed('Lora')] })

      const fonts = await card('Fonts · 6')
      expect(within(fonts).getByText('Lora')).toHaveStyle({
        fontFamily: "'Lora', sans-serif",
      })
      expect(within(fonts).getByText('Geist Mono')).toHaveStyle({
        fontFamily: "'Geist Mono', monospace",
      })
    })

    it('say what the project has none of', async () => {
      renderTab({ tokens: { sheets: [], tokens: [] } })

      expect(await card('Kits')).toHaveTextContent('KitsNone yet')
      await waitFor(async () =>
        expect(await card('Colors')).toHaveTextContent('ColorsNone yet'),
      )
      expect(await card('Radius, type, other')).toHaveTextContent('None yet')
    })

    it('say a read that failed', async () => {
      renderTab({ tokens: null, fonts: null })

      await waitFor(async () =>
        expect(await card('Colors')).toHaveTextContent('ColorsDid not load'),
      )
      expect(await card('Fonts')).toHaveTextContent(
        'Installed fonts did not load',
      )
    })

    it('name a sheet that does not parse, over counting none', async () => {
      renderTab({
        tokens: table([], {
          sheets: [
            {
              path: 'studio/tokens.css',
              kind: 'project',
              error: 'Unclosed block at line 1',
              hash: 'h',
            },
          ],
        }),
      })

      await waitFor(async () =>
        expect(await card('Colors')).toHaveTextContent(
          'Colorstokens.css does not parse',
        ),
      )
    })

    it('read the tokens again on each board message', async () => {
      let reads = 0
      const load = async () => {
        reads += 1
        return table(Array.from({ length: reads }, (_, at) => row(`--c${at}`)))
      }
      const loadFonts = async () => null
      render(<ThemeTab project="studio" load={load} loadFonts={loadFonts} />)
      const before = reads

      liveBoard()

      await waitFor(() => expect(reads).toBeGreaterThan(before))
      expect(await card(`Colors · ${reads}`)).toBeInTheDocument()
    })

    it('fit a 220px panel, a long kit name and thirty fonts cut to one line', async () => {
      liveBoard([
        { name: 'long', title: 'A kit with a name of length', frameCount: 0 },
        { name: 'two', title: 'Another kit with a long name', frameCount: 0 },
      ])
      const fonts = Array.from({ length: 25 }, (_, at) =>
        installed(`Family ${at}`),
      )
      render(
        <div data-testid="panel" className="w-[220px] text-xs">
          <ThemeTab
            project="studio"
            load={async () => MIXED}
            loadFonts={async () => ({ version: 1, project: 'studio', fonts })}
          />
        </div>,
      )

      await card('Fonts · 30')
      const panel = screen.getByTestId('panel')
      expect(panel.scrollWidth).toBeLessThanOrEqual(panel.clientWidth)
    })
  })

  describe('opening the dialog', () => {
    it.each([
      ['Kits', 'kits'],
      ['Fonts', 'fonts'],
      ['Colors', 'color'],
      ['Radius, type, other', 'radius'],
    ])('%s opens it on its section', async (title, section) => {
      renderTab()

      await userEvent.click(await card(title))

      expect(themeDialogStore.getState()).toMatchObject({ open: true, section })
      expect(
        await screen.findByRole('dialog', { name: 'Theme · studio' }),
      ).toBeInTheDocument()
    })

    it('Edit theme… opens it on Kits', async () => {
      renderTab()

      await userEvent.click(await card('Edit theme…'))

      expect(
        await screen.findByRole('heading', { name: 'Kits' }),
      ).toBeInTheDocument()
    })

    it('reads View theme… in a tab that may not write', async () => {
      liveBoard([], false)
      renderTab()

      await userEvent.click(await card('View theme…'))

      expect(
        await screen.findByRole('dialog', { name: 'Theme · studio' }),
      ).toBeInTheDocument()
    })

    it.each([
      ['Fonts', '{Escape}'],
      ['Colors', '{Escape}'],
      ['Edit theme…', '{Escape}'],
    ])('hands the focus back to %s on Esc', async (title, key) => {
      renderTab()
      await userEvent.click(await card(title))
      await screen.findByRole('dialog', { name: 'Theme · studio' })

      await userEvent.keyboard(key)

      await waitFor(async () => expect(await card(title)).toHaveFocus())
    })

    it('hands the focus back on ✕ past a section switched to', async () => {
      renderTab()
      await userEvent.click(await card('Fonts'))
      await userEvent.click(await screen.findByRole('tab', { name: /^Colors/ }))

      await userEvent.click(screen.getByRole('button', { name: 'Close' }))

      await waitFor(async () => expect(await card('Fonts')).toHaveFocus())
    })
  })

  it('starts the Fonts section over in another project, closing an open search', async () => {
    const load = async () => MIXED
    const loadFonts = async () => null
    const { rerender } = render(
      <ThemeTab project="studio" load={load} loadFonts={loadFonts} />,
    )
    await userEvent.click(await card('Fonts'))
    await userEvent.click(
      await screen.findByRole('button', { name: 'Find a font' }),
    )

    rerender(<ThemeTab project="marketing" load={load} loadFonts={loadFonts} />)

    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(
      await screen.findByRole('button', { name: 'Find a font' }),
    ).toBeInTheDocument()
  })

  describe.each(['light', 'dark'])('in the %s theme', (theme) => {
    beforeEach(() => {
      document.documentElement.classList.toggle('dark', theme === 'dark')
    })

    afterEach(() => {
      document.documentElement.classList.remove('dark')
    })

    it('reads a card’s quiet line at 4.5:1 or better, at rest and hovered', async () => {
      renderTab()
      const kits = await card('Kits')
      const line = within(kits).getByText('None yet')

      expect(contrastOnPage(line)).toBeGreaterThanOrEqual(4.5)
      expect(await contrastHovered(line)).toBeGreaterThanOrEqual(4.5)
    })
  })
})
