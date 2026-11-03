import '../../styles.css'

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Toaster } from '@/client/components/ui/toast'
import type { StyleValue } from '@/shared/records/elements'
import type { TokenRow } from '@/shared/records/tokens'

import { SelectionColors } from './selection-colors'

function raw(value: string): StyleValue {
  return { value, token: null, percent: 100 }
}

function token(name: string): StyleValue {
  return { value: `var(${name})`, token: name, percent: 100 }
}

function renderColors(colors: StyleValue[]) {
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
  colors: StyleValue[],
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

      expect(replaced).toEqual([[raw('#4f46e5'), '--primary']])
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
