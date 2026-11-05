import '../../styles.css'

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Toaster } from '@/client/components/ui/toast'
import type { StyleValue, UsedColor } from '@/shared/records/elements'
import type { TokenRow } from '@/shared/records/tokens'
import { pointerOff, pointerOver } from '@/test/real-pointer'

import { clear, selectionStore } from '../selection'
import { SelectionColors } from './selection-colors'

function raw(value: string): StyleValue {
  return { value, token: null, percent: 100 }
}

function token(name: string): StyleValue {
  return { value: `var(${name})`, token: name, percent: 100 }
}

function renderColors(colors: UsedColor[]) {
  return render(
    <>
      <SelectionColors colors={colors} tokens={[]} theme="light" />
      <Toaster />
    </>,
  )
}

/** A project color token with one value in both themes. */
function colorToken(name: string, value: string): TokenRow {
  return {
    name,
    group: 'color',
    light: value,
    dark: value,
    sheet: 'tokens.css',
    overrides: false,
  }
}

const TOKENS = [
  colorToken('--accent', '#f59e0b'),
  colorToken('--text', '#111827'),
  colorToken('--primary', '#4f46e5'),
]

/** Selection colors that can replace, handing each pick to `onReplace`. */
function renderReplacing(
  colors: UsedColor[],
  onReplace: (color: StyleValue, token: string) => void = () => {},
  tokens: TokenRow[] = TOKENS,
) {
  return render(
    <>
      <SelectionColors
        colors={colors}
        tokens={tokens}
        theme="light"
        onReplace={onReplace}
      />
      <Toaster />
    </>,
  )
}

/** The token list a raw swatch opened, by its tokens' names, top to bottom. */
function offered(value: string): string[] {
  const list = screen.getByRole('list', {
    name: `Tokens to replace ${value} with`,
  })
  return within(list)
    .getAllByRole('button')
    .map((button) => button.textContent?.replace(/[0-9a-f]{6}$/, '') ?? '')
}

/** Each listed row's text, top to bottom. */
function rows(): string[] {
  const list = within(
    screen.getByRole('region', { name: /^Selection colors/ }),
  ).getByRole('list')
  return within(list)
    .getAllByRole('listitem')
    .map((row) => row.textContent ?? '')
}

/** Records every text the clipboard is handed, or refuses each one with `refusal`. */
function stubClipboard(refusal?: Error): string[] {
  const written: string[] = []
  vi.spyOn(navigator.clipboard, 'writeText').mockImplementation(
    async (text) => {
      if (refusal) throw refusal
      written.push(text)
    },
  )
  return written
}

describe('SelectionColors', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('order', () => {
    it('lists raw values before tokens, each group in the order it came', () => {
      renderColors([
        token('--primary'),
        raw('#111827'),
        token('--accent'),
        raw('#ffffff'),
      ])

      expect(rows()).toEqual([
        '111827100%',
        'ffffff100%',
        'primary100%',
        'accent100%',
      ])
    })

    it('lists tokens alone in their order when no raw value is used', () => {
      renderColors([token('--primary'), token('--accent')])

      expect(rows()).toEqual(['primary100%', 'accent100%'])
    })
  })

  describe('cap', () => {
    const SIX = [
      raw('#111827'),
      raw('#ffffff'),
      token('--primary'),
      token('--secondary'),
      token('--accent'),
      token('--border'),
    ]

    it('counts every color in its heading', () => {
      renderColors(SIX)

      expect(
        screen.getByRole('heading', { name: 'Selection colors · 6' }),
      ).toBeVisible()
    })

    it('lists five rows and a Show all for six colors', () => {
      renderColors(SIX)

      expect(rows()).toHaveLength(5)
      expect(screen.getByRole('button', { name: 'Show all 6' })).toBeVisible()
    })

    it('lists the rest once Show all is pressed', async () => {
      renderColors(SIX)

      await userEvent.click(screen.getByRole('button', { name: 'Show all 6' }))

      expect(rows()).toHaveLength(6)
      expect(screen.queryByRole('button', { name: /Show all/ })).toBeNull()
    })

    it('offers no Show all for exactly five colors', () => {
      renderColors(SIX.slice(0, 5))

      expect(rows()).toHaveLength(5)
      expect(screen.queryByRole('button', { name: /Show all/ })).toBeNull()
    })
  })

  describe('copy', () => {
    it('copies a raw value’s hex when its row is pressed', async () => {
      const written = stubClipboard()
      renderColors([raw('#4f46e5')])

      await userEvent.click(
        screen.getByRole('button', { name: 'Copy #4f46e5' }),
      )

      expect(written).toEqual(['#4f46e5'])
      expect(await screen.findByText('Copied #4f46e5')).toBeVisible()
    })

    it('copies a token as its var() when its row is pressed', async () => {
      const written = stubClipboard()
      renderColors([token('--primary')])

      await userEvent.click(
        screen.getByRole('button', { name: 'Copy var(--primary)' }),
      )

      expect(written).toEqual(['var(--primary)'])
    })

    it('copies from the keyboard on Enter and on Space', async () => {
      const written = stubClipboard()
      renderColors([raw('#4f46e5'), token('--primary')])

      await userEvent.tab()
      await userEvent.keyboard('{Enter}')
      await userEvent.tab()
      await userEvent.keyboard(' ')

      expect(written).toEqual(['#4f46e5', 'var(--primary)'])
    })

    it('says nothing was copied when the browser refuses the write', async () => {
      stubClipboard(new Error('Document is not focused.'))
      renderColors([raw('#4f46e5')])

      await userEvent.click(
        screen.getByRole('button', { name: 'Copy #4f46e5' }),
      )

      expect(await screen.findByText('Nothing was copied')).toBeVisible()
      expect(screen.queryByText('Copied #4f46e5')).toBeNull()
    })
  })

  describe('select', () => {
    const PAGE = 'studio/home'
    const FRAME = 'studio/home/hero'
    const HASH = 'a'.repeat(64)

    function renderSelecting(colors: UsedColor[]) {
      return render(
        <SelectionColors
          colors={colors}
          tokens={[]}
          theme="light"
          selectIn={{ page: PAGE, frame: FRAME, hash: HASH }}
        />,
      )
    }

    afterEach(() => {
      clear(selectionStore)
    })

    it('stays hidden until the pointer is over the row', async () => {
      renderSelecting([{ ...raw('#4f46e5'), uses: [3, 5] }])
      const button = screen.getByRole('button', {
        name: 'Select 2 elements using 4f46e5',
      })
      expect(button).not.toBeVisible()

      const row = screen.getByRole('listitem')
      await pointerOver(row)
      expect(button).toBeVisible()

      await pointerOff(row)
      expect(button).not.toBeVisible()
    })

    it('shows once the keyboard reaches the row, after its copy', async () => {
      renderSelecting([{ ...token('--primary'), uses: [3] }])
      const button = screen.getByRole('button', {
        name: 'Select 1 element using primary',
      })

      await userEvent.tab()
      expect(
        screen.getByRole('button', { name: 'Copy var(--primary)' }),
      ).toHaveFocus()
      expect(button).toBeVisible()

      await userEvent.tab()
      expect(button).toHaveFocus()
      expect(button).toBeVisible()
    })

    it('selects each element using the color, at the bytes it read', async () => {
      renderSelecting([{ ...raw('#4f46e5'), uses: [3, 5, 8] }])

      await userEvent.click(screen.getByRole('button', { name: /^Select / }))

      const { page, frames, elements, using } = selectionStore.getState()
      expect({ page, frames, using }).toEqual({
        page: PAGE,
        frames: [FRAME],
        using: '4f46e5',
      })
      expect(elements).toEqual([
        { frame: FRAME, index: 3, hash: HASH },
        { frame: FRAME, index: 5, hash: HASH },
        { frame: FRAME, index: 8, hash: HASH },
      ])
    })

    it('leaves a single selection for one element using it', async () => {
      renderSelecting([{ ...raw('#4f46e5'), uses: [3] }])

      await userEvent.click(screen.getByRole('button', { name: /^Select / }))

      expect(selectionStore.getState()).toMatchObject({
        element: { frame: FRAME, index: 3, hash: HASH },
        elements: [{ frame: FRAME, index: 3, hash: HASH }],
      })
    })

    it('selects on Enter without copying', async () => {
      const written = stubClipboard()
      renderSelecting([{ ...raw('#4f46e5'), uses: [3, 5] }])
      screen.getByRole('button', { name: /^Select / }).focus()

      await userEvent.keyboard('{Enter}')

      expect(selectionStore.getState().elements).toHaveLength(2)
      expect(written).toEqual([])
    })

    it('selects only the row’s own elements for a token and its raw value', async () => {
      renderSelecting([
        { ...token('--primary'), uses: [3] },
        { ...raw('#4f46e5'), uses: [5, 7] },
      ])

      await userEvent.click(
        screen.getByRole('button', {
          name: 'Select 1 element using primary',
        }),
      )

      expect(
        selectionStore.getState().elements?.map(({ index }) => index),
      ).toEqual([3])
    })

    it('names a color kept at a percent with it', async () => {
      renderSelecting([{ ...raw('#4f46e5'), percent: 50, uses: [3, 5] }])

      await userEvent.click(
        screen.getByRole('button', {
          name: 'Select 2 elements using 4f46e5 50%',
        }),
      )

      expect(selectionStore.getState().using).toBe('4f46e5 50%')
    })

    it('copies from the row with Select beside it', async () => {
      const written = stubClipboard()
      renderSelecting([{ ...token('--primary'), uses: [3] }])

      await userEvent.click(
        screen.getByRole('button', { name: 'Copy var(--primary)' }),
      )

      expect(written).toEqual(['var(--primary)'])
      expect(selectionStore.getState().elements).toBeUndefined()
    })

    it('offers none for a color no selectable element uses', () => {
      renderSelecting([{ ...raw('#ffffff'), uses: [] }])

      expect(screen.queryByRole('button', { name: /^Select / })).toBeNull()
    })

    it('offers none where the colors span frames', () => {
      renderColors([{ ...raw('#4f46e5'), uses: [3] }])

      expect(screen.queryByRole('button', { name: /^Select / })).toBeNull()
    })
  })

  describe('replace', () => {
    it('opens the color tokens from a raw row’s swatch, nearest value first', async () => {
      renderReplacing([raw('#4f46e5')])

      await userEvent.click(
        screen.getByRole('button', { name: 'Replace 4f46e5 with a token' }),
      )

      expect(offered('4f46e5')).toEqual(['primary', 'text', 'accent'])
    })

    it('hands the pick to the replace and closes the list', async () => {
      const replaced: [StyleValue, string][] = []
      renderReplacing([raw('#4f46e5')], (color, token) =>
        replaced.push([color, token]),
      )
      await userEvent.click(
        screen.getByRole('button', { name: 'Replace 4f46e5 with a token' }),
      )

      await userEvent.click(screen.getByRole('button', { name: /^primary/ }))

      await waitFor(() =>
        expect(replaced).toEqual([[raw('#4f46e5'), '--primary']]),
      )
      await waitFor(() =>
        expect(
          screen.queryByRole('list', {
            name: 'Tokens to replace 4f46e5 with',
          }),
        ).toBeNull(),
      )
    })

    it('closes the list on Escape, replacing nothing', async () => {
      const replaced: string[] = []
      renderReplacing([raw('#4f46e5')], (_, token) => replaced.push(token))
      await userEvent.click(
        screen.getByRole('button', { name: 'Replace 4f46e5 with a token' }),
      )

      await userEvent.keyboard('{Escape}')

      await waitFor(() =>
        expect(
          screen.queryByRole('list', {
            name: 'Tokens to replace 4f46e5 with',
          }),
        ).toBeNull(),
      )
      expect(replaced).toEqual([])
      expect(
        screen.getByRole('button', { name: 'Replace 4f46e5 with a token' }),
      ).toHaveFocus()
    })

    it('offers no replace on a token row', () => {
      renderReplacing([token('--primary')])

      expect(screen.queryByRole('button', { name: /^Replace/ })).toBeNull()
    })

    it('offers no replace where the selection cannot take one', () => {
      renderColors([raw('#4f46e5')])

      expect(screen.queryByRole('button', { name: /^Replace/ })).toBeNull()
    })

    it('still copies the raw value from the rest of the row', async () => {
      const written = stubClipboard()
      renderReplacing([raw('#4f46e5')])

      await userEvent.click(
        screen.getByRole('button', { name: 'Copy #4f46e5' }),
      )

      expect(written).toEqual(['#4f46e5'])
    })

    it('tabs from the swatch to the copy to Select', async () => {
      render(
        <SelectionColors
          colors={[{ ...raw('#4f46e5'), uses: [3] }]}
          tokens={TOKENS}
          theme="light"
          onReplace={() => {}}
          selectIn={{
            page: 'studio/home',
            frame: 'studio/home/hero',
            hash: 'a'.repeat(64),
          }}
        />,
      )

      await userEvent.tab()
      expect(
        screen.getByRole('button', { name: 'Replace 4f46e5 with a token' }),
      ).toHaveFocus()
      await userEvent.tab()
      expect(screen.getByRole('button', { name: 'Copy #4f46e5' })).toHaveFocus()
      await userEvent.tab()
      expect(
        screen.getByRole('button', { name: /^Select 1 element/ }),
      ).toHaveFocus()
    })

    it('says the project names no color tokens when it has none', async () => {
      renderReplacing([raw('#4f46e5')], () => {}, [])

      await userEvent.click(
        screen.getByRole('button', { name: 'Replace 4f46e5 with a token' }),
      )

      await waitFor(() =>
        expect(
          screen.getByText(/This project names no color tokens/),
        ).toBeVisible(),
      )
    })
  })
})
