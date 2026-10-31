import '../../../styles.css'

import { act, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { liveStore } from '@/client/live/store'
import type { ListResult } from '@/shared/records/list'
import type { TokenRow, TokenTable } from '@/shared/records/tokens'
import { contrastOnPage } from '@/test/contrast'

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

function board(): ListResult {
  return { root: '/board', projects: [] } as unknown as ListResult
}

afterEach(() => {
  act(() => liveStore.setState({ board: null }))
})

describe('ThemeTab', () => {
  it('names the sheet it read and says it is read-only', async () => {
    render(<ThemeTab project="studio" load={async () => table([])} />)

    expect(
      await screen.findByText(/read-only\. Edit the file or ask the agent\./),
    ).toHaveTextContent('From tokens.css, read-only.')
  })

  it('names the board and the project sheet in cascade order', async () => {
    const both = table([], {
      sheets: [
        { path: 'tokens.css', kind: 'board', error: null, hash: 'h' },
        { path: 'studio/tokens.css', kind: 'project', error: null, hash: 'p' },
      ],
    })

    render(<ThemeTab project="studio" load={async () => both} />)

    expect(await screen.findByText(/read-only/)).toHaveTextContent(
      'From tokens.css and studio/tokens.css, read-only.',
    )
  })

  it('draws each color with a light and a dark swatch', async () => {
    render(
      <ThemeTab
        project="studio"
        load={async () =>
          table([row('--primary', { light: '#4f46e5', dark: '#818cf8' })])
        }
      />,
    )

    const primary = (await screen.findByText('primary')).closest('li')
    expect(primary).not.toBeNull()
    expect(
      within(primary as HTMLElement).getByRole('img', {
        name: 'Light: #4f46e5',
      }),
    ).toHaveStyle({ backgroundColor: 'rgb(79, 70, 229)' })
    expect(
      within(primary as HTMLElement).getByRole('img', {
        name: 'Dark: #818cf8',
      }),
    ).toBeInTheDocument()
  })

  describe.each(['light', 'dark'])('in the %s theme', (theme) => {
    beforeEach(() => {
      document.documentElement.classList.toggle('dark', theme === 'dark')
    })

    afterEach(() => {
      document.documentElement.classList.remove('dark')
    })

    it('reads the L and D column header at 4.5:1 or better on the sidebar', async () => {
      render(
        <div className="bg-sidebar">
          <ThemeTab
            project="studio"
            load={async () => table([row('--primary')])}
          />
        </div>,
      )

      expect(
        contrastOnPage(await screen.findByText('L')),
      ).toBeGreaterThanOrEqual(4.5)
    })
  })

  it('marks a side a color does not set', async () => {
    render(
      <ThemeTab
        project="studio"
        load={async () => table([row('--glow', { light: null })])}
      />,
    )

    expect(
      await screen.findByRole('img', { name: 'Light: not set' }),
    ).toBeInTheDocument()
  })

  it('draws the groups in order under their headings', async () => {
    render(
      <ThemeTab
        project="studio"
        load={async () =>
          table([
            row('--space', { group: 'other', light: '16px', dark: '16px' }),
            row('--font-text', {
              group: 'font',
              light: 'Geist, sans-serif',
              dark: 'Geist, sans-serif',
            }),
            row('--radius-sm', { group: 'radius', light: '4px', dark: '4px' }),
            row('--primary'),
          ])
        }
      />,
    )

    const headings = await screen.findAllByRole('heading', { level: 3 })
    expect(headings.map((heading) => heading.textContent)).toEqual([
      'Color',
      'Radius',
      'Font',
      'Other',
    ])
  })

  it('shows a value as text and a font by its first family', async () => {
    render(
      <ThemeTab
        project="studio"
        load={async () =>
          table([
            row('--radius-sm', { group: 'radius', light: '4px', dark: '4px' }),
            row('--font-mono', {
              group: 'font',
              light: "'Geist Mono', monospace",
              dark: "'Geist Mono', monospace",
            }),
          ])
        }
      />,
    )

    expect(await screen.findByText('4px')).toBeInTheDocument()
    expect(screen.getByText('Geist Mono')).toBeInTheDocument()
  })

  it('draws the empty card when the project has no token sheet', async () => {
    render(
      <ThemeTab
        project="studio"
        load={async () => ({ sheets: [], tokens: [] })}
      />,
    )

    expect(await screen.findByText('No tokens yet')).toBeInTheDocument()
  })

  it('names a sheet that does not parse rather than drawing the empty card', async () => {
    const broken = table([], {
      sheets: [
        {
          path: 'tokens.css',
          kind: 'board',
          error: 'Unclosed block at line 1',
          hash: 'h',
        },
      ],
    })

    render(<ThemeTab project="studio" load={async () => broken} />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'tokens.css does not parse',
    )
    expect(screen.queryByText('No tokens yet')).toBeNull()
  })

  it('says the tokens did not load when the read fails', async () => {
    render(<ThemeTab project="studio" load={async () => null} />)

    expect(
      await screen.findByText(/The tokens did not load/),
    ).toBeInTheDocument()
  })

  it('reads the table again on each board message', async () => {
    let reads = 0
    const load = async () => {
      reads += 1
      return table([row(`--read-${reads}`)])
    }
    render(<ThemeTab project="studio" load={load} />)
    await screen.findByText('read-1')

    act(() => liveStore.setState({ board: board() }))

    expect(await screen.findByText('read-2')).toBeInTheDocument()
  })
})
