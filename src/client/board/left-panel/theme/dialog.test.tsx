import '../../../styles.css'

import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  onTestFinished,
  vi,
} from 'vitest'

import { Toaster } from '@/client/components/ui/toast'
import { markPointerFocus } from '@/client/focus/pointer-mark'
import { liveStore } from '@/client/live/store'
import type { KitRecord } from '@/shared/kits'
import type { ProjectKitRecord } from '@/shared/records/list'
import type { FontList, InstalledFont } from '@/shared/records/sourcing'
import type { TokenRow, TokenTable } from '@/shared/records/tokens'
import { boardOf, frameOf, pageOf } from '@/test/board'
import { contrastOnPage, ringContrastOnPage } from '@/test/contrast'
import { keyboardFocus } from '@/test/focus-ring'
import { pointerOff, pointerOver, realClick } from '@/test/real-pointer'

import { Composer } from '../../notes/composer'
import { closeNote, notesUi, useNotesUi } from '../../notes/tool'
import { clear, select, selectionStore } from '../../selection'
import { closeTheme, openTheme, type ThemeSection } from './dialog-store'
import { ThemeTab } from './tab'
import type { writeToken } from './write'

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

const TABLE: TokenTable = {
  sheets: [
    { path: 'tokens.css', kind: 'board', error: null, hash: 'b'.repeat(64) },
  ],
  tokens: [
    row('--primary', { light: '#4f46e5', dark: '#818cf8' }),
    row('--accent'),
    row('--radius-sm', { group: 'radius', light: '4px', dark: '4px' }),
    row('--font-text', {
      group: 'font',
      light: 'Geist, sans-serif',
      dark: 'Geist, sans-serif',
    }),
  ],
}

const LORA: InstalledFont = {
  id: 'lora',
  family: 'Lora',
  category: 'serif',
  license: 'OFL-1.1',
  licenseUrl: 'https://example.test/lora/license',
  landingUrl: 'https://fontsource.org/fonts/lora',
  variable: true,
  weights: [{ min: 400, max: 700 }],
  styles: ['normal'],
  path: 'fonts/lora',
  files: 2,
  bundled: false,
  frames: [],
}

const SKETCH: ProjectKitRecord = {
  name: 'sketch',
  title: 'Sketch',
  frameCount: 3,
}

const CLEAN: KitRecord = {
  name: 'clean',
  title: 'Clean',
  description: '',
  source: 'shipped',
  preview: null,
}

const fontList: FontList = { version: 1, project: 'studio', fonts: [LORA] }
const load = async () => TABLE
const loadFonts = async () => fontList
const loadKits = async () => [CLEAN]

/** A write landing at once on the hash it was given. */
const write: typeof writeToken = async (project, hash, change) => ({
  project,
  name: change.name,
  light: null,
  dark: null,
  hash: hash ?? '',
  sheet: change.sheet ?? 'project',
  created: false,
})

function liveBoard(canWrite = true) {
  const board = boardOf(pageOf([frameOf('hero'), frameOf('pricing')]))
  const [project] = board.projects
  if (project) project.kits = [SKETCH]
  act(() => liveStore.setState({ board, canWrite }))
}

type TabProps = Partial<Parameters<typeof ThemeTab>[0]>

async function openOn(section: ThemeSection, props: TabProps = {}) {
  render(
    <ThemeTab
      project="studio"
      load={load}
      loadFonts={loadFonts}
      write={write}
      kitCalls={{ loadKits }}
      {...props}
    />,
  )
  act(() => openTheme(section, section))
  return screen.findByRole('dialog', { name: 'Theme · studio' })
}

/** A search finding one font, whose install waits until it is refused. */
function refusedInstall() {
  let reject: (error: Error) => void = () => {}
  const fontCalls: TabProps['fontCalls'] = {
    find: async (_project, query) => ({
      version: 1,
      query,
      category: null,
      licenses: ['OFL-1.1'],
      source: { name: 'Fontsource', url: 'https://fontsource.org' },
      total: 1,
      results: [
        {
          number: 1,
          id: 'playfair-display',
          family: 'Playfair Display',
          category: 'serif',
          license: 'OFL-1.1',
          variable: true,
          weights: [400],
          styles: ['normal'],
          subsets: ['latin'],
          landingUrl: 'https://fontsource.org/fonts/playfair-display',
          sample: 'https://cdn.example.test/playfair.woff2',
        },
      ],
    }),
    install: () =>
      new Promise((_resolve, refused) => {
        reject = refused
      }),
  }
  const refuse = () => reject(new Error('Fontsource refused the files.'))
  return { fontCalls, refuse }
}

/** Finds the one font `refusedInstall` answers with and presses its Install. */
async function pressInstall() {
  await userEvent.click(
    await screen.findByRole('button', { name: 'Find a font' }),
  )
  await userEvent.type(screen.getByRole('searchbox'), 'playfair')
  await userEvent.click(
    await screen.findByRole('button', { name: 'Install Playfair Display' }),
  )
}

/** The note a person is writing, where the board's markers draw it. */
function OpenNote() {
  const open = useNotesUi((state) => state.open)
  return open?.kind === 'new' ? (
    <Composer pick={open.pick} onClose={closeNote} />
  ) : null
}

function sectionTab(title: string) {
  return screen.getByRole('tab', { name: new RegExp(`^${title}`) })
}

function themeDialog() {
  return screen.queryByRole('dialog', { name: 'Theme · studio' })
}

async function themeClosed() {
  await waitFor(() => expect(themeDialog()).toBeNull())
}

/**
 * Holds animation frames from now until the answer is called, so a late frame
 * is certain. A test that fails first still gives the window's own back.
 */
function holdFrames(): () => void {
  const held = new Map<number, FrameRequestCallback>()
  // Clear of any id the window itself gave out before the hold.
  let id = 1_000_000
  const ask = vi
    .spyOn(window, 'requestAnimationFrame')
    .mockImplementation((frame) => {
      id += 1
      held.set(id, frame)
      return id
    })
  const drop = vi
    .spyOn(window, 'cancelAnimationFrame')
    .mockImplementation((asked) => {
      held.delete(asked)
    })
  const release = () => {
    ask.mockRestore()
    drop.mockRestore()
    const frames = [...held.values()]
    held.clear()
    act(() => {
      for (const frame of frames) frame(performance.now())
    })
  }
  onTestFinished(release)
  return release
}

beforeEach(() => {
  liveBoard()
})

afterEach(() => {
  act(() => {
    closeTheme()
    closeNote()
    clear(selectionStore)
    notesUi.setState({ drafts: {} })
    liveStore.setState({ board: null, canWrite: false })
  })
})

describe('ThemeDialog', () => {
  describe('the section list', () => {
    it('lists the six sections with what each holds', async () => {
      await openOn('kits')
      await waitFor(() =>
        expect(sectionTab('Fonts')).toHaveTextContent('Fonts6'),
      )

      expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
        'Kits1',
        'Fonts6',
        'Colors2',
        'Radius1',
        'Font tokens1',
        'Other0',
      ])
    })

    it.each([
      ['Kits', 'Kits'],
      ['Fonts', 'Fonts'],
      ['Colors', 'Colors'],
      ['Radius', 'Radius'],
      ['Font tokens', 'Font tokens'],
      ['Other', 'Other'],
    ])('shows %s alone on a press', async (title, heading) => {
      await openOn(title === 'Kits' ? 'fonts' : 'kits')

      await userEvent.click(sectionTab(title))

      await waitFor(() =>
        expect(
          screen
            .getAllByRole('heading', { level: 3 })
            .map((shown) => shown.textContent),
        ).toEqual([heading]),
      )
    })

    it('moves through the sections on the arrow keys from the one it opened on', async () => {
      await openOn('fonts')
      await waitFor(() => expect(sectionTab('Fonts')).toHaveFocus())

      await userEvent.keyboard('{ArrowDown}')
      expect(
        await screen.findByRole('heading', { name: 'Colors' }),
      ).toBeInTheDocument()
      await userEvent.keyboard('{ArrowUp}{ArrowUp}')

      expect(
        await screen.findByRole('heading', { name: 'Kits' }),
      ).toBeInTheDocument()
      expect(sectionTab('Kits')).toHaveFocus()
    })

    it('keeps the section shown while a save it started lands', async () => {
      let reads = 0
      let land = () => {}
      await openOn('radius', {
        load: async () => {
          reads += 1
          return TABLE
        },
        write: (...edit) =>
          new Promise((resolve) => {
            land = () => resolve(write(...edit))
          }),
      })
      const field = await screen.findByRole('textbox', {
        name: 'radius-sm value',
      })
      await userEvent.clear(field)
      await userEvent.type(field, '6{Enter}')

      await act(async () => land())
      liveBoard()

      await waitFor(() => expect(reads).toBeGreaterThan(1))
      expect(
        screen.getByRole('heading', { name: 'Radius' }),
      ).toBeInTheDocument()
      expect(field).toBeInTheDocument()
    })

    it('draws no outline on a pressed section once a key turns the browser’s on', async () => {
      const stop = markPointerFocus(window)
      await openOn('kits')
      await realClick(sectionTab('Colors'))

      await keyboardFocus(sectionTab('Colors'))

      expect(sectionTab('Colors')).toHaveAttribute('data-pointer-focus')
      expect(getComputedStyle(sectionTab('Colors')).outlineStyle).toBe('none')
      stop()
    })

    it.each(['light', 'dark'])(
      'rings a section focused by a key at 3:1 or better in %s',
      async (theme) => {
        document.documentElement.classList.toggle('dark', theme === 'dark')
        const stop = markPointerFocus(window)
        await openOn('kits')

        await keyboardFocus(sectionTab('Colors'))
        await Promise.all(
          sectionTab('Colors')
            .getAnimations()
            .map((motion) => motion.finished),
        )

        expect(ringContrastOnPage(sectionTab('Colors'))).toBeGreaterThanOrEqual(
          3,
        )
        stop()
        document.documentElement.classList.remove('dark')
      },
    )

    it.each(['light', 'dark'])(
      'reads a hovered section’s count at 4.5:1 or better in %s',
      async (theme) => {
        document.documentElement.classList.toggle('dark', theme === 'dark')
        await openOn('kits')
        const count = await within(sectionTab('Colors')).findByText('2')

        await pointerOver(sectionTab('Colors'))
        await Promise.all(
          sectionTab('Colors')
            .getAnimations({ subtree: true })
            .map((motion) => motion.finished),
        )

        expect(contrastOnPage(count)).toBeGreaterThanOrEqual(4.5)
        await pointerOff(sectionTab('Colors'))
        document.documentElement.classList.remove('dark')
      },
    )

    it('says why a section is empty', async () => {
      await openOn('other')

      expect(
        await screen.findByText('These sheets set no other tokens.'),
      ).toBeInTheDocument()
    })
  })

  describe('a layer inside it', () => {
    it('keeps the dialog on Esc in a text value, then closes on the next', async () => {
      await openOn('font')
      await userEvent.click(
        await screen.findByRole('button', {
          name: 'font-text value: Geist, sans-serif',
        }),
      )

      await userEvent.keyboard('x{Escape}')

      expect(themeDialog()).not.toBeNull()
      expect(
        screen.getByRole('button', {
          name: 'font-text value: Geist, sans-serif',
        }),
      ).toHaveFocus()
      await userEvent.keyboard('{Escape}')
      await themeClosed()
    })

    it('keeps the dialog on Esc in a number, with the focus still inside it, then closes on the next', async () => {
      const dialog = await openOn('radius')
      const field = await screen.findByRole('textbox', {
        name: 'radius-sm value',
      })
      await userEvent.click(field)

      await userEvent.keyboard('9{Escape}')

      expect(themeDialog()).not.toBeNull()
      expect(field).toHaveValue('4')
      expect(dialog.contains(document.activeElement)).toBe(true)
      await userEvent.keyboard('{Escape}')
      await themeClosed()
    })

    it('keeps the dialog on Esc in the color picker, then closes on the next', async () => {
      await openOn('color')
      await userEvent.click(
        await screen.findByRole('button', { name: 'Light: #4f46e5' }),
      )
      await screen.findByRole('textbox', { name: 'Hex' })

      await userEvent.keyboard('{Escape}')

      await waitFor(() =>
        expect(screen.queryByRole('textbox', { name: 'Hex' })).toBeNull(),
      )
      expect(themeDialog()).not.toBeNull()
      await userEvent.keyboard('{Escape}')
      await themeClosed()
    })

    it('closes the color picker alone on an Esc before it takes the focus', async () => {
      await openOn('color')
      const swatch = await screen.findByRole('button', {
        name: 'Light: #4f46e5',
      })
      const release = holdFrames()
      await userEvent.click(swatch)
      await screen.findByRole('textbox', { name: 'Hex' })

      await userEvent.keyboard('{Escape}')
      release()

      await waitFor(() =>
        expect(screen.queryByRole('textbox', { name: 'Hex' })).toBeNull(),
      )
      expect(themeDialog()).not.toBeNull()
      expect(swatch).toHaveFocus()
      await userEvent.keyboard('{Escape}')
      await themeClosed()
    })

    it('keeps the dialog through a press in the color picker, which draws outside it', async () => {
      await openOn('color')
      await userEvent.click(
        await screen.findByRole('button', { name: 'Light: #4f46e5' }),
      )

      await userEvent.click(await screen.findByRole('textbox', { name: 'Hex' }))

      expect(themeDialog()).not.toBeNull()
      expect(screen.getByRole('textbox', { name: 'Hex' })).toHaveFocus()
    })

    it('keeps the dialog on Esc in the font search, then closes on the next', async () => {
      await openOn('fonts')
      await userEvent.click(
        await screen.findByRole('button', { name: 'Find a font' }),
      )

      await userEvent.keyboard('{Escape}')

      expect(screen.queryByRole('searchbox')).toBeNull()
      expect(themeDialog()).not.toBeNull()
      expect(screen.getByRole('button', { name: 'Find a font' })).toHaveFocus()
      await userEvent.keyboard('{Escape}')
      await themeClosed()
    })

    it('keeps the dialog on Esc in the kit menu, then closes on the next', async () => {
      await openOn('kits')
      await userEvent.click(
        await screen.findByRole('button', { name: 'Add kit' }),
      )
      await screen.findByRole('menu')

      await userEvent.keyboard('{Escape}')

      await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
      expect(themeDialog()).not.toBeNull()
      await userEvent.keyboard('{Escape}')
      await themeClosed()
    })

    it('keeps the dialog on Esc in a kit’s remove confirm', async () => {
      await openOn('kits')
      await userEvent.click(
        await screen.findByRole('button', { name: 'Remove Sketch' }),
      )
      await screen.findByRole('dialog', { name: 'Remove Sketch?' })

      await userEvent.keyboard('{Escape}')

      await waitFor(() =>
        expect(
          screen.queryByRole('dialog', { name: 'Remove Sketch?' }),
        ).toBeNull(),
      )
      expect(themeDialog()).not.toBeNull()
    })

    it('keeps the dialog on Esc in a font’s remove confirm', async () => {
      await openOn('fonts', {
        fontCalls: { readFrames: async () => ['studio/home/hero'] },
      })
      await userEvent.click(
        await screen.findByRole('button', { name: 'Remove Lora' }),
      )
      await screen.findByRole('dialog', { name: 'Remove Lora?' })

      await userEvent.keyboard('{Escape}')

      await waitFor(() =>
        expect(
          screen.queryByRole('dialog', { name: 'Remove Lora?' }),
        ).toBeNull(),
      )
      expect(themeDialog()).not.toBeNull()
    })
  })

  it('keeps the focus inside as a confirmed removal takes its button away', async () => {
    const dialog = await openOn('kits', {
      kitCalls: {
        loadKits,
        calls: {
          installKit: async () => {
            throw new Error('Nothing installs here.')
          },
          removeKit: async () => {
            const board = boardOf(pageOf([frameOf('hero')]))
            act(() => liveStore.setState({ board }))
            return { undo: null } as never
          },
        },
      },
    })
    await userEvent.click(
      await screen.findByRole('button', { name: 'Remove Sketch' }),
    )
    const confirm = await screen.findByRole('dialog', {
      name: 'Remove Sketch?',
    })

    await userEvent.click(
      within(confirm).getByRole('button', { name: 'Remove' }),
    )

    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Remove Sketch?' }),
      ).toBeNull(),
    )
    await waitFor(() =>
      expect(dialog.contains(document.activeElement)).toBe(true),
    )
  })

  it('writes a picked color when the press that closes the picker lands outside the dialog', async () => {
    const sent: string[] = []
    await openOn('color', {
      write: (project, hash, change) => {
        if ('value' in change) sent.push(change.value)
        return write(project, hash, change)
      },
    })
    await userEvent.click(
      await screen.findByRole('button', { name: 'Light: #4f46e5' }),
    )
    const hex = await screen.findByRole('textbox', { name: 'Hex' })
    await userEvent.clear(hex)
    await userEvent.type(hex, '112233')

    const scrim = document.querySelector('[data-slot="dialog-overlay"]')
    if (!scrim) throw new Error('The dialog draws no scrim')
    await userEvent.click(scrim)

    await waitFor(() => expect(sent).toEqual(['#112233']))
  })

  it('keeps an open row’s draft while an agent’s write updates the others', async () => {
    let table = TABLE
    await openOn('color', { load: async () => table })
    await userEvent.click(sectionTab('Font tokens'))
    await userEvent.click(
      await screen.findByRole('button', {
        name: 'font-text value: Geist, sans-serif',
      }),
    )
    const field = screen.getByRole('textbox', { name: 'font-text value' })
    await userEvent.clear(field)
    await userEvent.type(field, 'Lora')

    table = {
      ...TABLE,
      tokens: [
        ...TABLE.tokens,
        row('--font-mono', {
          group: 'font',
          light: 'Geist Mono, monospace',
          dark: 'Geist Mono, monospace',
        }),
      ],
    }
    liveBoard()

    expect(
      await screen.findByRole('button', {
        name: 'font-mono value: Geist Mono, monospace',
      }),
    ).toBeInTheDocument()
    expect(field).toHaveValue('Lora')
  })

  it('toasts an install refused once its section was left', async () => {
    const { fontCalls, refuse } = refusedInstall()
    render(<Toaster />)
    await openOn('fonts', { fontCalls })
    await pressInstall()
    const release = holdFrames()

    await userEvent.click(sectionTab('Colors'))
    await act(async () => refuse())
    release()

    expect(
      await screen.findByText('Couldn’t install Playfair Display'),
    ).toBeInTheDocument()
  })

  it('toasts an install refused as the dialog closes', async () => {
    const { fontCalls, refuse } = refusedInstall()
    render(<Toaster />)
    await openOn('fonts', { fontCalls })
    await pressInstall()
    const release = holdFrames()

    act(() => closeTheme())
    await act(async () => refuse())
    release()

    expect(
      await screen.findByText('Couldn’t install Playfair Display'),
    ).toBeInTheDocument()
  })

  it('toasts a removal refused as the dialog closes', async () => {
    let refuse = () => {}
    const remove = () =>
      new Promise<never>((_resolve, reject) => {
        refuse = () => reject(new Error('The fonts folder is locked.'))
      })
    render(<Toaster />)
    await openOn('fonts', {
      fontCalls: { readFrames: async () => [], remove },
    })
    await userEvent.click(
      await screen.findByRole('button', { name: 'Remove Lora' }),
    )
    const release = holdFrames()

    act(() => closeTheme())
    await act(async () => refuse())
    release()

    expect(await screen.findByText('Couldn’t remove Lora')).toBeInTheDocument()
  })

  it('shows an install refused inline once the dialog reopens mid-close', async () => {
    const { fontCalls, refuse } = refusedInstall()
    render(<Toaster />)
    await openOn('fonts', { fontCalls })
    await pressInstall()
    const release = holdFrames()

    act(() => closeTheme())
    act(() => openTheme('fonts', 'fonts'))
    await act(async () => refuse())
    release()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Couldn’t install Playfair Display. Fontsource refused the files.',
    )
  })

  it('hands the focus to the note Ask the agent opens, with the dialog gone', async () => {
    act(() => select(selectionStore, 'studio/home', ['studio/home/hero']))
    render(<OpenNote />)
    await openOn('kits')
    await userEvent.click(
      await screen.findByRole('button', { name: 'Add kit' }),
    )

    await userEvent.click(
      await screen.findByRole('menuitem', {
        name: 'Ask the agent for a new kit',
      }),
    )

    await themeClosed()
    await waitFor(() =>
      expect(document.querySelector('[data-base-ui-portal]')).toBeNull(),
    )
    expect(screen.getByRole('textbox', { name: 'Note on hero' })).toHaveFocus()
  })

  it('opens on a tab that may not write, with nothing to edit and why', async () => {
    liveBoard(false)
    const dialog = await openOn('color')

    expect(
      await within(dialog).findByText(
        'View only, so values can’t be changed here.',
      ),
    ).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: /^Light:/ })).toBeNull()
  })
})
