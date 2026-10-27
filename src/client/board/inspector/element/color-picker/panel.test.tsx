import '../../../../styles.css'

import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { StyleValue } from '@/shared/records/elements'
import type { TokenRow } from '@/shared/records/tokens'

import { ColorRow } from '../color-row'

const PRIMARY: TokenRow = {
  name: '--primary',
  group: 'color',
  light: '#4f46e5',
  dark: '#818cf8',
  sheet: 'tokens.css',
}
const ACCENT: TokenRow = { ...PRIMARY, name: '--accent', light: '#f59e0b' }

const RAW: StyleValue = { value: '#111827', token: null, percent: 100 }

/** A row's writes and previews, every write answered as landed. */
function renderRow(value: StyleValue = RAW, currentColor?: string) {
  const writes: string[] = []
  const previews: (string | null)[] = []
  render(
    <ColorRow
      label="Fill"
      value={value}
      tokens={[PRIMARY, ACCENT]}
      theme="light"
      disabled={false}
      currentColor={currentColor}
      onWrite={async (css) => {
        writes.push(css)
        return true
      }}
      onPreview={(css) => previews.push(css)}
    />,
  )
  return { writes, previews }
}

async function openCustom() {
  await userEvent.click(screen.getByRole('button', { name: 'Fill color' }))
  return screen.findByRole('slider', { name: 'Saturation and brightness' })
}

/** Picks a channel format, then waits out the menu's close animation. */
async function pickFormat(name: 'RGB' | 'HSL') {
  await userEvent.click(screen.getByRole('button', { name: 'Color format' }))
  await userEvent.click(await screen.findByRole('menuitem', { name }))
  // The closing popup stays mounted with pointer-events off, so a reopen under load would click it.
  await vi.waitFor(() => expect(screen.queryByRole('menu')).toBeNull(), {
    timeout: 5000,
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the color picker', () => {
  it('previews a custom color while open and writes nothing on Esc', async () => {
    const { writes, previews } = renderRow()
    const area = await openCustom()

    area.focus()
    await userEvent.keyboard('{ArrowUp}{ArrowUp}')
    await userEvent.keyboard('{Escape}')

    expect(previews.length).toBeGreaterThan(1)
    expect(previews.at(-1)).toBeNull()
    expect(writes).toEqual([])
  })

  it('writes a custom color once as it closes', async () => {
    const { writes } = renderRow()
    const area = await openCustom()

    area.focus()
    await userEvent.keyboard('{Shift>}{ArrowRight}{ArrowUp}{/Shift}')
    await userEvent.click(document.body)

    expect(writes).toHaveLength(1)
    expect(writes[0]).toMatch(/^#[0-9a-f]{6}$/)
    expect(writes[0]).not.toBe('#111827')
  })

  it('writes nothing as it closes on the color it opened at', async () => {
    const { writes } = renderRow()
    await openCustom()

    await userEvent.click(document.body)

    expect(writes).toEqual([])
  })

  it('writes a token swatch at once as its token, and closes', async () => {
    const { writes } = renderRow()
    await openCustom()

    await userEvent.click(screen.getByRole('button', { name: 'accent' }))

    expect(writes).toEqual(['var(--accent)'])
    expect(
      screen.queryByRole('slider', { name: 'Saturation and brightness' }),
    ).toBeNull()
  })

  it('keeps the row’s percent on a custom color', async () => {
    const { writes } = renderRow({ ...RAW, percent: 50 })
    const hex = await openCustom().then(() =>
      screen.getByRole('textbox', { name: 'Hex' }),
    )

    await userEvent.clear(hex)
    await userEvent.type(hex, 'FF0000{Enter}')

    expect(writes).toEqual(['#ff000080'])
  })

  it('opens the chip on Tokens, listing each by name', async () => {
    renderRow({ value: 'var(--primary)', token: '--primary', percent: 100 })

    await userEvent.click(screen.getByRole('button', { name: 'Fill token' }))

    const list = within(
      await screen.findByRole('list', { name: 'Fill tokens' }),
    )
    expect(list.getByRole('button', { name: 'primary' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it.each([
    ['an rgb() value', { ...RAW, value: 'rgb(79, 70, 229)' }, undefined],
    ['currentcolor', { ...RAW, value: 'currentcolor' }, 'rgb(79, 70, 229)'],
    [
      'a token',
      { value: 'var(--primary)', token: '--primary', percent: 100 },
      undefined,
    ],
  ] as const)('opens at %s', async (_name, value, current) => {
    renderRow(value, current)

    await openCustom()

    expect(screen.getByRole('textbox', { name: 'Hex' })).toHaveValue('4F46E5')
  })

  it('shows the color as RGB and as HSL', async () => {
    renderRow({ ...RAW, value: '#4f46e5' })
    await openCustom()

    await pickFormat('RGB')
    expect(
      ['Red', 'Green', 'Blue'].map(
        (name) =>
          (screen.getByRole('textbox', { name }) as HTMLInputElement).value,
      ),
    ).toEqual(['79', '70', '229'])

    await pickFormat('HSL')
    expect(
      ['Hue', 'Saturation', 'Lightness'].map(
        (name) =>
          (screen.getByRole('textbox', { name }) as HTMLInputElement).value,
      ),
    ).toEqual(['243', '75', '59'])
  })

  it('fits a three-digit channel beside its scrub zone', async () => {
    renderRow({ ...RAW, value: '#f9f9f9' })
    await openCustom()

    await userEvent.click(screen.getByRole('button', { name: 'Color format' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'RGB' }))
    const red = screen.getByRole('textbox', { name: 'Red' }) as HTMLInputElement

    expect(red.value).toBe('249')
    expect(red.scrollWidth).toBeLessThanOrEqual(red.clientWidth)
    // The layout width, since the popover's open animation scales its box.
    expect(screen.getByText('R').offsetWidth).toBeGreaterThanOrEqual(24)
  })

  it('moves the hue from its bar', async () => {
    renderRow({ ...RAW, value: '#ff0000' })
    await openCustom()

    screen.getByRole('slider', { name: 'Hue' }).focus()
    await userEvent.keyboard('{Shift>}{ArrowRight}{/Shift}'.repeat(12))

    expect(screen.getByRole('textbox', { name: 'Hex' })).not.toHaveValue(
      'FF0000',
    )
  })

  it('offers no eyedropper where the browser has none', async () => {
    vi.stubGlobal('EyeDropper', undefined)
    Reflect.deleteProperty(window, 'EyeDropper')
    renderRow()

    await openCustom()

    expect(
      screen.queryByRole('button', { name: 'Pick a color from the screen' }),
    ).toBeNull()
  })

  it('takes the eyedropper’s color', async () => {
    vi.stubGlobal(
      'EyeDropper',
      class {
        async open() {
          return { sRGBHex: '#0ea5e9' }
        }
      },
    )
    renderRow()
    await openCustom()

    await userEvent.click(
      screen.getByRole('button', { name: 'Pick a color from the screen' }),
    )
    await act(async () => {})

    expect(screen.getByRole('textbox', { name: 'Hex' })).toHaveValue('0EA5E9')
  })
})
