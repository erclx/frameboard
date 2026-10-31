import '../../../styles.css'

import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { liveStore } from '@/client/live/store'
import type { ListResult } from '@/shared/records/list'
import type { TokenRow, TokenTable } from '@/shared/records/tokens'
import { contrastOnPage } from '@/test/contrast'

import { ThemeTab } from './tab'
import { type TokenChange, writeToken } from './write'

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
  it('names the board sheet it read', async () => {
    render(<ThemeTab project="studio" load={async () => table([])} />)

    expect(await screen.findByText(/^From board/)).toHaveTextContent(
      /^From board tokens\.css\.$/,
    )
  })

  it('names the board sheet and the project sheet overriding it', async () => {
    const both = table([], {
      sheets: [
        { path: 'tokens.css', kind: 'board', error: null, hash: 'h' },
        { path: 'studio/tokens.css', kind: 'project', error: null, hash: 'p' },
      ],
    })

    render(<ThemeTab project="studio" load={async () => both} />)

    expect(await screen.findByText(/^From board/)).toHaveTextContent(
      'From board tokens.css, overridden by project studio/tokens.css.',
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

    it('reads the Project tag at 4.5:1 or better on the sidebar', async () => {
      render(
        <div className="bg-sidebar">
          <ThemeTab
            project="studio"
            load={async () =>
              table([row('--primary', { sheet: 'studio/tokens.css' })], {
                sheets: [
                  { path: 'tokens.css', kind: 'board', error: null, hash: 'h' },
                  {
                    path: 'studio/tokens.css',
                    kind: 'project',
                    error: null,
                    hash: 'p',
                  },
                ],
              })
            }
          />
        </div>,
      )

      expect(
        contrastOnPage(await screen.findByText('Project')),
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

  describe('editing', () => {
    const PROJECT_HASH = 'c'.repeat(64)
    const WRITTEN_HASH = 'd'.repeat(64)

    function both(tokens: TokenRow[]): TokenTable {
      return table(tokens, {
        sheets: [
          { path: 'tokens.css', kind: 'board', error: null, hash: 'h' },
          {
            path: 'studio/tokens.css',
            kind: 'project',
            error: null,
            hash: PROJECT_HASH,
          },
        ],
      })
    }

    interface Sent {
      hash: string | null
      change: TokenChange
    }

    function recordingWrite(sent: Sent[]): typeof writeToken {
      return async (project, hash, change) => {
        sent.push({ hash, change })
        return {
          project,
          name: change.name,
          light: null,
          dark: null,
          hash: WRITTEN_HASH,
          created: false,
        }
      }
    }

    beforeEach(() => {
      act(() => liveStore.setState({ canWrite: true }))
    })

    afterEach(() => {
      act(() => liveStore.setState({ canWrite: false }))
    })

    it('ends the note on how to edit', async () => {
      render(<ThemeTab project="studio" load={async () => both([])} />)

      expect(await screen.findByText(/^From board/)).toHaveTextContent(
        /overridden by project studio\/tokens\.css\. Click a value to edit it\.$/,
      )
    })

    it('tags a project value Project and any other Board', async () => {
      render(
        <ThemeTab
          project="studio"
          load={async () =>
            both([
              row('--primary', { sheet: 'studio/tokens.css', overrides: true }),
              row('--secondary'),
            ])
          }
        />,
      )

      expect(
        (await screen.findByText('primary')).closest('li'),
      ).toHaveTextContent('Project')
      expect(screen.getByText('secondary').closest('li')).toHaveTextContent(
        'Board',
      )
    })

    it('offers a reset only on a row the project overrides', async () => {
      render(
        <ThemeTab
          project="studio"
          load={async () =>
            both([
              row('--primary', { sheet: 'studio/tokens.css', overrides: true }),
              row('--own', { sheet: 'studio/tokens.css' }),
            ])
          }
        />,
      )

      expect(
        await screen.findByRole('button', {
          name: 'Reset primary to the board value',
        }),
      ).toBeInTheDocument()
      expect(
        screen.queryByRole('button', { name: 'Reset own to the board value' }),
      ).toBeNull()
    })

    it('gives the reset and the swatches 24px targets that do not overlap', async () => {
      render(
        <div className="w-60 bg-sidebar">
          <ThemeTab
            project="studio"
            load={async () =>
              both([
                row('--primary', {
                  sheet: 'studio/tokens.css',
                  overrides: true,
                }),
              ])
            }
          />
        </div>,
      )

      const reset = (
        await screen.findByRole('button', {
          name: 'Reset primary to the board value',
        })
      ).getBoundingClientRect()
      const light = screen
        .getByRole('button', { name: /^Light:/ })
        .getBoundingClientRect()
      const dark = screen
        .getByRole('button', { name: /^Dark:/ })
        .getBoundingClientRect()

      expect(
        [reset, light, dark].map((box) => [box.width, box.height]),
      ).toEqual([
        [24, 24],
        [24, 24],
        [24, 24],
      ])
      expect(reset.right).toBeLessThanOrEqual(light.left)
      expect(light.right).toBeLessThanOrEqual(dark.left)
    })

    it('reaches the reset by Tab and sends it from the sheet the tab read', async () => {
      const sent: Sent[] = []
      render(
        <ThemeTab
          project="studio"
          load={async () =>
            both([
              row('--primary', { sheet: 'studio/tokens.css', overrides: true }),
            ])
          }
          write={recordingWrite(sent)}
        />,
      )
      await screen.findByText('primary')

      await userEvent.tab()
      await userEvent.keyboard('{Enter}')

      expect(sent).toEqual([
        { hash: PROJECT_HASH, change: { name: '--primary', reset: true } },
      ])
    })

    it('opens the picker on Custom for the swatch and writes once as it closes', async () => {
      const sent: Sent[] = []
      render(
        <ThemeTab
          project="studio"
          load={async () =>
            both([row('--primary', { light: '#4f46e5', dark: '#818cf8' })])
          }
          write={recordingWrite(sent)}
        />,
      )

      await userEvent.click(
        await screen.findByRole('button', { name: 'Dark: #818cf8' }),
      )
      const hex = await screen.findByRole('textbox', { name: 'Hex' })
      await userEvent.clear(hex)
      await userEvent.type(hex, '112233{Enter}')

      expect(screen.queryByRole('tab', { name: 'Tokens' })).toBeNull()
      expect(sent).toEqual([
        {
          hash: PROJECT_HASH,
          change: { name: '--primary', side: 'dark', value: '#112233' },
        },
      ])
    })

    it('writes nothing when the picker closes on Escape', async () => {
      const sent: Sent[] = []
      render(
        <ThemeTab
          project="studio"
          load={async () => both([row('--primary', { light: '#4f46e5' })])}
          write={recordingWrite(sent)}
        />,
      )

      await userEvent.click(
        await screen.findByRole('button', { name: 'Light: #4f46e5' }),
      )
      const hex = await screen.findByRole('textbox', { name: 'Hex' })
      await userEvent.clear(hex)
      await userEvent.type(hex, '112233')
      await userEvent.keyboard('{Escape}')

      expect(sent).toEqual([])
    })

    it('writes a typed number with its unit on Enter', async () => {
      const sent: Sent[] = []
      render(
        <ThemeTab
          project="studio"
          load={async () =>
            both([
              row('--radius-sm', {
                group: 'radius',
                light: '4px',
                dark: '4px',
              }),
            ])
          }
          write={recordingWrite(sent)}
        />,
      )

      const field = await screen.findByRole('textbox', {
        name: 'radius-sm value',
      })
      await userEvent.clear(field)
      await userEvent.type(field, '6{Enter}')

      expect(sent.map((call) => call.change)).toEqual([
        { name: '--radius-sm', side: 'both', value: '6px' },
      ])
    })

    it('keeps a number set at zero or above from going below zero', async () => {
      const sent: Sent[] = []
      render(
        <ThemeTab
          project="studio"
          load={async () =>
            both([
              row('--radius-sm', {
                group: 'radius',
                light: '1px',
                dark: '1px',
              }),
            ])
          }
          write={recordingWrite(sent)}
        />,
      )

      await userEvent.click(
        await screen.findByRole('textbox', { name: 'radius-sm value' }),
      )
      await userEvent.keyboard('{Shift>}{ArrowDown}{/Shift}')

      expect(sent.map((call) => call.change)).toEqual([
        { name: '--radius-sm', side: 'both', value: '0px' },
      ])
    })

    it('edits a font as text, Enter writing the whole value', async () => {
      const sent: Sent[] = []
      render(
        <ThemeTab
          project="studio"
          load={async () =>
            both([
              row('--font-text', {
                group: 'font',
                light: 'Geist, sans-serif',
                dark: 'Geist, sans-serif',
              }),
            ])
          }
          write={recordingWrite(sent)}
        />,
      )

      await userEvent.click(
        await screen.findByRole('button', {
          name: 'font-text value: Geist, sans-serif',
        }),
      )
      const field = screen.getByRole('textbox', { name: 'font-text value' })
      await userEvent.clear(field)
      await userEvent.type(field, 'Inter, sans-serif{Enter}')

      expect(sent.map((call) => call.change)).toEqual([
        { name: '--font-text', side: 'both', value: 'Inter, sans-serif' },
      ])
    })

    it('puts the stored text back on Escape and writes nothing', async () => {
      const sent: Sent[] = []
      render(
        <ThemeTab
          project="studio"
          load={async () =>
            both([
              row('--font-text', {
                group: 'font',
                light: 'Geist, sans-serif',
                dark: 'Geist, sans-serif',
              }),
            ])
          }
          write={recordingWrite(sent)}
        />,
      )

      await userEvent.click(
        await screen.findByRole('button', {
          name: 'font-text value: Geist, sans-serif',
        }),
      )
      await userEvent.type(
        screen.getByRole('textbox', { name: 'font-text value' }),
        'x{Escape}',
      )

      expect(sent).toEqual([])
      expect(
        screen.getByRole('button', {
          name: 'font-text value: Geist, sans-serif',
        }),
      ).toHaveFocus()
    })

    it('sends the next edit from the hash the last one wrote', async () => {
      const sent: Sent[] = []
      render(
        <ThemeTab
          project="studio"
          load={async () =>
            both([
              row('--primary', { sheet: 'studio/tokens.css', overrides: true }),
              row('--accent', { sheet: 'studio/tokens.css', overrides: true }),
            ])
          }
          write={recordingWrite(sent)}
        />,
      )

      await userEvent.click(
        await screen.findByRole('button', {
          name: 'Reset primary to the board value',
        }),
      )
      await userEvent.click(
        screen.getByRole('button', { name: 'Reset accent to the board value' }),
      )

      expect(sent.map((call) => call.hash)).toEqual([
        PROJECT_HASH,
        WRITTEN_HASH,
      ])
    })

    it('raises the error toast on a refused write and keeps the stored value', async () => {
      const refusals: { title: string; description: string }[] = []
      const refuse: typeof fetch = async () =>
        Response.json(
          { ok: false, error: { code: 'stale-tokens', message: 'changed' } },
          { status: 409 },
        )
      render(
        <ThemeTab
          project="studio"
          load={async () =>
            both([
              row('--radius-sm', {
                group: 'radius',
                light: '4px',
                dark: '4px',
              }),
            ])
          }
          write={(project, hash, change) =>
            writeToken(project, hash, change, {
              send: refuse,
              notify: (refusal) => refusals.push(refusal),
            })
          }
        />,
      )

      const field = await screen.findByRole('textbox', {
        name: 'radius-sm value',
      })
      await userEvent.clear(field)
      await userEvent.type(field, '6{Enter}')

      expect(refusals).toEqual([
        {
          title: "Couldn't change radius-sm",
          description:
            'The token sheet changed since the tab read it. Try again on the value it shows now.',
        },
      ])
      expect(field).toHaveValue('4')
    })

    it('stays read-only while the project sheet does not parse', async () => {
      const broken: TokenTable = {
        sheets: [
          { path: 'tokens.css', kind: 'board', error: null, hash: 'h' },
          {
            path: 'studio/tokens.css',
            kind: 'project',
            error: 'Unclosed block at line 1',
            hash: PROJECT_HASH,
          },
        ],
        tokens: [row('--primary', { light: '#4f46e5' })],
      }

      render(<ThemeTab project="studio" load={async () => broken} />)

      expect(
        await screen.findByRole('img', { name: 'Light: #4f46e5' }),
      ).toBeInTheDocument()
      expect(screen.queryByText(/Click a value to edit it/)).toBeNull()
    })
  })
})
