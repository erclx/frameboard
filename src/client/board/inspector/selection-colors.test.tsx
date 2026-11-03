import '../../styles.css'

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { Toaster } from '@/client/components/ui/toast'
import type { StyleValue } from '@/shared/records/elements'

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
})
