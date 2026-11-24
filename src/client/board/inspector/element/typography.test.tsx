import '../../../styles.css'

import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import type { InstalledFont } from '@/shared/records/sourcing'
import type { TokenRow } from '@/shared/records/tokens'

import { recorder } from './fixtures'
import { TypographySection } from './typography'
import { type WriteElement } from './write'

/** The kit's tooltip popup, apart from a caption carrying the same words. */
const TOOLTIP = '[data-slot="tooltip-content"]'

const installedFont: InstalledFont = {
  id: 'playfair-display',
  family: 'Playfair Display',
  category: 'serif',
  license: 'OFL-1.1',
  licenseUrl: 'https://example.test/playfair-display/license',
  landingUrl: 'https://fontsource.org/fonts/playfair-display',
  variable: true,
  weights: [{ min: 400, max: 900 }],
  styles: ['normal'],
  path: 'fonts/playfair-display',
  files: 2,
  bundled: false,
  frames: [],
}

/** Type details as an element with no decoration, case, truncation, or wrap style computes them. */
const PLAIN_TYPE = {
  textDecorationLine: 'none',
  textTransform: 'none',
  textWrapStyle: 'auto',
  truncated: false,
  display: 'block',
}

describe('TypographySection', () => {
  const FONT_TEXT: TokenRow = {
    name: '--font-text',
    group: 'font',
    light: 'Geist, sans-serif',
    dark: null,
    sheet: 'tokens.css',
    overrides: false,
  }
  const FONT_SIZE: TokenRow = {
    name: '--font-size-sm',
    group: 'font',
    light: '12px',
    dark: null,
    sheet: 'tokens.css',
    overrides: false,
  }

  it('binds a raw family equal to a token’s stack to that token on a pick', async () => {
    const { changes, write } = recorder()
    render(
      <TypographySection
        fonts={[FONT_TEXT]}
        fontFamily="Geist, sans-serif"
        fontToken={null}
        fontSize={30}
        fontWeight={700}
        textAlign="left"
        details={PLAIN_TYPE}
        lineHeight={null}
        letterSpacing={0}
        disabled={false}
        write={write}
      />,
    )

    const trigger = screen.getByRole('button', { name: 'Font family' })
    expect(trigger).toHaveTextContent('Geist')
    await userEvent.click(trigger)
    await userEvent.click(
      await screen.findByRole('menuitemradio', { name: 'font-text' }),
    )

    expect(changes).toEqual([
      { kind: 'style', property: 'font-family', value: 'var(--font-text)' },
    ])
  })

  it('lists an installed family after the served faces, drawn in its face, and writes its name', async () => {
    const { changes, write } = recorder()
    render(
      <TypographySection
        fonts={[]}
        installed={{
          version: 1,
          project: 'studio',
          fonts: [installedFont],
        }}
        fontFamily="Geist, sans-serif"
        fontToken={null}
        fontSize={30}
        fontWeight={700}
        textAlign="left"
        details={PLAIN_TYPE}
        lineHeight={null}
        letterSpacing={0}
        disabled={false}
        write={write}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Font family' }))
    const items = await screen.findAllByRole('menuitemradio')
    expect(items.map((item) => item.textContent)).toEqual([
      'Geist',
      'Geist Mono',
      'Inter',
      'Source Serif 4',
      'Caveat',
      'Playfair Display',
    ])
    const installed = screen.getByRole('menuitemradio', {
      name: 'Playfair Display',
    })
    expect(installed).toHaveStyle({ fontFamily: '"Playfair Display"' })
    await userEvent.click(installed)

    expect(changes).toEqual([
      { kind: 'style', property: 'font-family', value: "'Playfair Display'" },
    ])
  })

  it('shows a token the menu does not list by its name', () => {
    const { write } = recorder()
    render(
      <TypographySection
        fonts={[FONT_TEXT]}
        fontFamily="Geist, sans-serif"
        fontToken="--font-heading"
        fontSize={30}
        fontWeight={700}
        textAlign="left"
        details={PLAIN_TYPE}
        lineHeight={null}
        letterSpacing={0}
        disabled={false}
        write={write}
      />,
    )

    expect(
      screen.getByRole('button', { name: 'Font family' }),
    ).toHaveTextContent('font-heading')
  })

  it('shows a family a token sets by the token, and writes nothing for that token', async () => {
    const { changes, write } = recorder()
    render(
      <TypographySection
        fonts={[FONT_TEXT]}
        fontFamily="Geist, sans-serif"
        fontToken="--font-text"
        fontSize={30}
        fontWeight={700}
        textAlign="left"
        details={PLAIN_TYPE}
        lineHeight={null}
        letterSpacing={0}
        disabled={false}
        write={write}
      />,
    )

    const trigger = screen.getByRole('button', { name: 'Font family' })
    expect(trigger).toHaveTextContent('font-text')
    await userEvent.click(trigger)
    await userEvent.click(
      await screen.findByRole('menuitemradio', { name: 'font-text' }),
    )

    expect(changes).toEqual([])
  })

  it('writes a font token as its var()', async () => {
    const { changes, write } = recorder()
    render(
      <TypographySection
        fonts={[FONT_TEXT]}
        fontFamily="Caveat, cursive"
        fontToken={null}
        fontSize={30}
        fontWeight={400}
        textAlign="left"
        details={PLAIN_TYPE}
        lineHeight={null}
        letterSpacing={0}
        disabled={false}
        write={write}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Font family' }))
    await userEvent.click(
      await screen.findByRole('menuitemradio', { name: 'font-text' }),
    )

    expect(changes).toEqual([
      { kind: 'style', property: 'font-family', value: 'var(--font-text)' },
    ])
  })

  it('writes a served face by its family, quoted when it holds a space', async () => {
    const { changes, write } = recorder()
    render(
      <TypographySection
        fonts={[FONT_TEXT]}
        fontFamily="Geist, sans-serif"
        fontToken={null}
        fontSize={30}
        fontWeight={400}
        textAlign="left"
        details={PLAIN_TYPE}
        lineHeight={null}
        letterSpacing={0}
        disabled={false}
        write={write}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Font family' }))
    await userEvent.click(
      await screen.findByRole('menuitemradio', { name: 'Geist Mono' }),
    )

    expect(changes).toEqual([
      { kind: 'style', property: 'font-family', value: "'Geist Mono'" },
    ])
  })

  it('closes the family menu on a pick, so it covers nothing below', async () => {
    const { write } = recorder()
    render(
      <TypographySection
        fonts={[FONT_TEXT]}
        fontFamily="Geist, sans-serif"
        fontToken={null}
        fontSize={30}
        fontWeight={400}
        textAlign="left"
        details={PLAIN_TYPE}
        lineHeight={null}
        letterSpacing={0}
        disabled={false}
        write={write}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Font family' }))
    await userEvent.click(
      await screen.findByRole('menuitemradio', { name: 'Geist Mono' }),
    )

    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  })

  it('lists the font tokens holding a family ahead of the faces, leaving a size out', async () => {
    const { write } = recorder()
    render(
      <TypographySection
        fonts={[FONT_SIZE, FONT_TEXT]}
        fontFamily="Geist, sans-serif"
        fontToken={null}
        fontSize={30}
        fontWeight={400}
        textAlign="left"
        details={PLAIN_TYPE}
        lineHeight={null}
        letterSpacing={0}
        disabled={false}
        write={write}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Font family' }))
    const items = await screen.findAllByRole('menuitemradio')

    expect(items.map((item) => item.textContent)).toEqual([
      'font-text',
      'Geist',
      'Geist Mono',
      'Inter',
      'Source Serif 4',
      'Caveat',
    ])
  })

  it('shows a family the menu does not hold as written', () => {
    const { write } = recorder()
    render(
      <TypographySection
        fonts={[FONT_TEXT]}
        fontFamily='"Inter Tight", sans-serif'
        fontToken={null}
        fontSize={30}
        fontWeight={400}
        textAlign="left"
        details={PLAIN_TYPE}
        lineHeight={null}
        letterSpacing={0}
        disabled={false}
        write={write}
      />,
    )

    expect(
      screen.getByRole('button', { name: 'Font family' }),
    ).toHaveTextContent('Inter Tight')
  })

  it('writes the size in px', async () => {
    const { changes, write } = recorder()
    render(
      <TypographySection
        fonts={[]}
        fontFamily="Geist, sans-serif"
        fontToken={null}
        fontSize={30}
        fontWeight={700}
        textAlign="left"
        details={PLAIN_TYPE}
        lineHeight={null}
        letterSpacing={0}
        disabled={false}
        write={write}
      />,
    )

    const field = screen.getByRole('textbox', { name: 'Font size' })
    await userEvent.clear(field)
    await userEvent.type(field, '24{Enter}')

    expect(changes).toEqual([
      { kind: 'style', property: 'font-size', value: '24px' },
    ])
  })

  it('writes the weight', async () => {
    const { changes, write } = recorder()
    render(
      <TypographySection
        fonts={[]}
        fontFamily="Geist, sans-serif"
        fontToken={null}
        fontSize={30}
        fontWeight={700}
        textAlign="left"
        details={PLAIN_TYPE}
        lineHeight={null}
        letterSpacing={0}
        disabled={false}
        write={write}
      />,
    )

    const trigger = screen.getByRole('button', { name: 'Font weight' })
    expect(trigger).toHaveTextContent('Bold700')
    await userEvent.click(trigger)
    await userEvent.click(
      await screen.findByRole('menuitemradio', { name: /^Medium/ }),
    )

    expect(changes).toEqual([
      { kind: 'style', property: 'font-weight', value: '500' },
    ])
  })

  it('writes nothing for the weight already set', async () => {
    const { changes, write } = recorder()
    render(
      <TypographySection
        fonts={[]}
        fontFamily="Geist, sans-serif"
        fontToken={null}
        fontSize={30}
        fontWeight={700}
        textAlign="left"
        details={PLAIN_TYPE}
        lineHeight={null}
        letterSpacing={0}
        disabled={false}
        write={write}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Font weight' }))
    const bold = await screen.findByRole('menuitemradio', { name: /^Bold/ })
    expect(bold).toHaveAttribute('aria-checked', 'true')
    await userEvent.click(bold)

    expect(changes).toEqual([])
  })

  it('offers only the weights the face ships', async () => {
    const { write } = recorder()
    render(
      <TypographySection
        fonts={[]}
        fontFamily="Caveat, cursive"
        fontToken={null}
        fontSize={30}
        fontWeight={400}
        textAlign="left"
        details={PLAIN_TYPE}
        lineHeight={null}
        letterSpacing={0}
        disabled={false}
        write={write}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Font weight' }))
    const items = await screen.findAllByRole('menuitemradio')

    expect(items.map((item) => item.textContent)).toEqual([
      'Regular400',
      'Medium500',
      'Semi Bold600',
      'Bold700',
    ])
  })

  it('keeps the checked weight number clear of the check', async () => {
    const { write } = recorder()
    render(
      <TypographySection
        fonts={[]}
        fontFamily="Geist, sans-serif"
        fontToken={null}
        fontSize={30}
        fontWeight={400}
        textAlign="left"
        details={PLAIN_TYPE}
        lineHeight={null}
        letterSpacing={0}
        disabled={false}
        write={write}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Font weight' }))
    const regular = await screen.findByRole('menuitemradio', {
      name: /^Regular/,
    })
    const number = within(regular).getByText('400')
    const check = regular.querySelector(
      '[data-slot="dropdown-menu-radio-item-indicator"]',
    )

    expect(regular).toHaveAttribute('aria-checked', 'true')
    expect(check).not.toBeNull()
    expect(number.getBoundingClientRect().right).toBeLessThanOrEqual(
      check?.getBoundingClientRect().left ?? Number.NEGATIVE_INFINITY,
    )
  })

  it('shows a weight the face lacks as its number', () => {
    const { write } = recorder()
    render(
      <TypographySection
        fonts={[]}
        fontFamily="Caveat, cursive"
        fontToken={null}
        fontSize={30}
        fontWeight={900}
        textAlign="left"
        details={PLAIN_TYPE}
        lineHeight={null}
        letterSpacing={0}
        disabled={false}
        write={write}
      />,
    )

    expect(
      screen.getByRole('button', { name: 'Font weight' }),
    ).toHaveTextContent('900')
  })

  it('writes the alignment a button names and lights the computed one', async () => {
    const { changes, write } = recorder()
    render(
      <TypographySection
        fonts={[]}
        fontFamily="Geist, sans-serif"
        fontToken={null}
        fontSize={30}
        fontWeight={700}
        textAlign="left"
        details={PLAIN_TYPE}
        lineHeight={null}
        letterSpacing={0}
        disabled={false}
        write={write}
      />,
    )

    await userEvent.click(
      screen.getByRole('button', { name: 'Align text center' }),
    )

    expect(
      screen.getByRole('button', { name: 'Align text left' }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(changes).toEqual([
      { kind: 'style', property: 'text-align', value: 'center' },
    ])
  })

  it('writes justify and lights it when the element computes it', async () => {
    const { changes, write } = recorder()
    const { rerender } = render(
      <TypographySection
        fonts={[]}
        fontFamily="Geist, sans-serif"
        fontToken={null}
        fontSize={30}
        fontWeight={700}
        textAlign="left"
        details={PLAIN_TYPE}
        lineHeight={null}
        letterSpacing={0}
        disabled={false}
        write={write}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Justify text' }))
    rerender(
      <TypographySection
        fonts={[]}
        fontFamily="Geist, sans-serif"
        fontToken={null}
        fontSize={30}
        fontWeight={700}
        textAlign="justify"
        details={PLAIN_TYPE}
        lineHeight={null}
        letterSpacing={0}
        disabled={false}
        write={write}
      />,
    )

    expect(changes).toEqual([
      { kind: 'style', property: 'text-align', value: 'justify' },
    ])
    expect(
      screen.getByRole('button', { name: 'Justify text' }),
    ).toHaveAttribute('aria-pressed', 'true')
  })

  it('captions the alignment buttons as a group', () => {
    const { write } = recorder()
    render(
      <TypographySection
        fonts={[]}
        fontFamily="Geist, sans-serif"
        fontToken={null}
        fontSize={30}
        fontWeight={700}
        textAlign="left"
        details={PLAIN_TYPE}
        lineHeight={null}
        letterSpacing={0}
        disabled={false}
        write={write}
      />,
    )

    expect(
      within(screen.getByRole('group', { name: 'Alignment' })).getAllByRole(
        'button',
      ),
    ).toHaveLength(4)
  })

  it('names an alignment button in a tooltip on hover', async () => {
    const { write } = recorder()
    render(
      <TypographySection
        fonts={[]}
        fontFamily="Geist, sans-serif"
        fontToken={null}
        fontSize={30}
        fontWeight={700}
        textAlign="left"
        details={PLAIN_TYPE}
        lineHeight={null}
        letterSpacing={0}
        disabled={false}
        write={write}
      />,
    )

    await userEvent.hover(
      screen.getByRole('button', { name: 'Align text right' }),
    )

    expect(
      await screen.findByText('Align text right', { selector: TOOLTIP }),
    ).toBeInTheDocument()
  })

  it('names an icon field in a tooltip on keyboard focus', async () => {
    const { write } = recorder()
    render(
      <TypographySection
        fonts={[]}
        fontFamily="Geist, sans-serif"
        fontToken={null}
        fontSize={30}
        fontWeight={700}
        textAlign="left"
        details={PLAIN_TYPE}
        lineHeight={null}
        letterSpacing={0}
        disabled={false}
        write={write}
      />,
    )

    act(() => screen.getByRole('textbox', { name: 'Letter spacing' }).focus())

    expect(
      await screen.findByText('Letter spacing', { selector: TOOLTIP }),
    ).toBeInTheDocument()
  })

  it('shows the computed line height and letter spacing', () => {
    const { write } = recorder()
    render(
      <TypographySection
        fonts={[]}
        fontFamily="Geist, sans-serif"
        fontToken={null}
        fontSize={30}
        fontWeight={700}
        textAlign="left"
        details={PLAIN_TYPE}
        lineHeight={36}
        letterSpacing={-0.5}
        disabled={false}
        write={write}
      />,
    )

    expect(screen.getByRole('textbox', { name: 'Line height' })).toHaveValue(
      '36',
    )
    expect(screen.getByRole('textbox', { name: 'Letter spacing' })).toHaveValue(
      '-0.5',
    )
  })

  it('reads a normal line height as Auto and writes nothing until changed', async () => {
    const { changes, write } = recorder()
    render(
      <TypographySection
        fonts={[]}
        fontFamily="Geist, sans-serif"
        fontToken={null}
        fontSize={30}
        fontWeight={700}
        textAlign="left"
        details={PLAIN_TYPE}
        lineHeight={null}
        letterSpacing={0}
        disabled={false}
        write={write}
      />,
    )
    const field = screen.getByRole('textbox', { name: 'Line height' })

    await userEvent.click(field)
    await userEvent.tab()

    expect(field).toHaveValue('')
    expect(field).toHaveAttribute('placeholder', 'Auto')
    expect(changes).toEqual([])
  })

  it('writes a typed line height in px', async () => {
    const { changes, write } = recorder()
    render(
      <TypographySection
        fonts={[]}
        fontFamily="Geist, sans-serif"
        fontToken={null}
        fontSize={30}
        fontWeight={700}
        textAlign="left"
        details={PLAIN_TYPE}
        lineHeight={36}
        letterSpacing={0}
        disabled={false}
        write={write}
      />,
    )

    const field = screen.getByRole('textbox', { name: 'Line height' })
    await userEvent.clear(field)
    await userEvent.type(field, '40{Enter}')

    expect(changes).toEqual([
      { kind: 'style', property: 'line-height', value: '40px' },
    ])
  })

  it('steps an Auto line height from the normal one, 1.2 times the size', async () => {
    const { changes, write } = recorder()
    render(
      <TypographySection
        fonts={[]}
        fontFamily="Geist, sans-serif"
        fontToken={null}
        fontSize={30}
        fontWeight={700}
        textAlign="left"
        details={PLAIN_TYPE}
        lineHeight={null}
        letterSpacing={0}
        disabled={false}
        write={write}
      />,
    )

    await userEvent.click(screen.getByRole('textbox', { name: 'Line height' }))
    await userEvent.keyboard('{ArrowUp}')

    expect(changes).toEqual([
      { kind: 'style', property: 'line-height', value: '37px' },
    ])
  })

  it('writes a typed letter spacing in px', async () => {
    const { changes, write } = recorder()
    render(
      <TypographySection
        fonts={[]}
        fontFamily="Geist, sans-serif"
        fontToken={null}
        fontSize={30}
        fontWeight={700}
        textAlign="left"
        details={PLAIN_TYPE}
        lineHeight={null}
        letterSpacing={0}
        disabled={false}
        write={write}
      />,
    )

    const field = screen.getByRole('textbox', { name: 'Letter spacing' })
    await userEvent.clear(field)
    await userEvent.type(field, '-0.5{Enter}')

    expect(changes).toEqual([
      { kind: 'style', property: 'letter-spacing', value: '-0.5px' },
    ])
  })

  describe('Type details', () => {
    function renderDetails(
      write: WriteElement,
      details: Partial<typeof PLAIN_TYPE> = {},
    ) {
      render(
        <TypographySection
          fonts={[]}
          fontFamily="Geist, sans-serif"
          fontToken={null}
          fontSize={30}
          fontWeight={700}
          textAlign="left"
          details={{ ...PLAIN_TYPE, ...details }}
          lineHeight={null}
          letterSpacing={0}
          disabled={false}
          write={write}
        />,
      )
    }

    it('writes the decoration a button names', async () => {
      const { changes, write } = recorder()
      renderDetails(write)

      await userEvent.click(
        screen.getByRole('button', { name: 'Type details' }),
      )
      await userEvent.click(
        await screen.findByRole('button', { name: 'Underline' }),
      )

      expect(changes).toEqual([
        { kind: 'style', property: 'text-decoration-line', value: 'underline' },
      ])
    })

    it('lights the computed case and writes none over an inherited one', async () => {
      const { changes, write } = recorder()
      renderDetails(write, { textTransform: 'uppercase' })

      await userEvent.click(
        screen.getByRole('button', { name: 'Type details' }),
      )
      const upper = await screen.findByRole('button', { name: 'Uppercase' })
      expect(upper).toHaveAttribute('aria-pressed', 'true')
      await userEvent.click(screen.getByRole('button', { name: 'No case' }))

      expect(changes).toEqual([
        { kind: 'style', property: 'text-transform', value: 'none' },
      ])
    })

    it('writes title case as capitalize', async () => {
      const { changes, write } = recorder()
      renderDetails(write)

      await userEvent.click(
        screen.getByRole('button', { name: 'Type details' }),
      )
      await userEvent.click(
        await screen.findByRole('button', { name: 'Title case' }),
      )

      expect(changes).toEqual([
        { kind: 'style', property: 'text-transform', value: 'capitalize' },
      ])
    })

    it('truncates to one line as one edit of three declarations', async () => {
      const { changes, write } = recorder()
      renderDetails(write)

      await userEvent.click(
        screen.getByRole('button', { name: 'Type details' }),
      )
      await userEvent.click(
        await screen.findByRole('button', { name: 'Truncate text' }),
      )

      expect(changes).toEqual([
        {
          kind: 'styles',
          declarations: [
            { property: 'overflow', value: 'hidden' },
            { property: 'text-wrap-mode', value: 'nowrap' },
            { property: 'text-overflow', value: 'ellipsis' },
          ],
        },
      ])
    })

    it('writes all three truncation declarations back when turned off', async () => {
      const { changes, write } = recorder()
      renderDetails(write, { truncated: true })

      await userEvent.click(
        screen.getByRole('button', { name: 'Type details' }),
      )
      expect(
        await screen.findByRole('button', { name: 'Truncate text' }),
      ).toHaveAttribute('aria-pressed', 'true')
      await userEvent.click(
        screen.getByRole('button', { name: 'No truncation' }),
      )

      expect(changes).toEqual([
        {
          kind: 'styles',
          declarations: [
            { property: 'overflow', value: 'visible' },
            { property: 'text-wrap-mode', value: 'wrap' },
            { property: 'text-overflow', value: 'clip' },
          ],
        },
      ])
    })

    it('offers no truncation on an inline box, which nothing clips', async () => {
      const { write } = recorder()
      renderDetails(write, { display: 'inline' })

      await userEvent.click(
        screen.getByRole('button', { name: 'Type details' }),
      )

      expect(
        await screen.findByRole('button', { name: 'Truncate text' }),
      ).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Underline' })).toBeEnabled()
    })

    it('writes the wrap style picked from its menu', async () => {
      const { changes, write } = recorder()
      renderDetails(write)

      await userEvent.click(
        screen.getByRole('button', { name: 'Type details' }),
      )
      await userEvent.click(await screen.findByRole('button', { name: 'Wrap' }))
      await userEvent.click(
        await screen.findByRole('menuitemradio', { name: 'Balance' }),
      )

      expect(changes).toEqual([
        { kind: 'style', property: 'text-wrap-style', value: 'balance' },
      ])
    })

    it('writes nothing for the value already lit', async () => {
      const { changes, write } = recorder()
      renderDetails(write)

      await userEvent.click(
        screen.getByRole('button', { name: 'Type details' }),
      )
      await userEvent.click(
        await screen.findByRole('button', { name: 'No decoration' }),
      )

      expect(changes).toEqual([])
    })

    it('holds one tab stop per row and moves along it with the arrow keys', async () => {
      const { changes, write } = recorder()
      renderDetails(write, { textTransform: 'uppercase' })

      await userEvent.click(
        screen.getByRole('button', { name: 'Type details' }),
      )
      const upper = await screen.findByRole('button', { name: 'Uppercase' })
      expect(upper).toHaveAttribute('tabindex', '0')
      expect(screen.getByRole('button', { name: 'No case' })).toHaveAttribute(
        'tabindex',
        '-1',
      )
      act(() => upper.focus())
      await userEvent.keyboard('{ArrowRight}')

      expect(screen.getByRole('button', { name: 'Lowercase' })).toHaveFocus()
      expect(changes).toEqual([])
    })

    it('leaves a row on Tab from a button an arrow key reached behind the lit one', async () => {
      const { write } = recorder()
      renderDetails(write, { textTransform: 'lowercase' })

      await userEvent.click(
        screen.getByRole('button', { name: 'Type details' }),
      )
      const none = await screen.findByRole('button', { name: 'No case' })
      act(() => none.focus())
      await userEvent.keyboard('{ArrowRight}')
      await userEvent.tab()

      expect(
        screen.getByRole('button', { name: 'No truncation' }),
      ).toHaveFocus()
    })

    it('leaves a row on Shift+Tab from a button an arrow key reached past the lit one', async () => {
      const { write } = recorder()
      renderDetails(write, { textTransform: 'uppercase' })

      await userEvent.click(
        screen.getByRole('button', { name: 'Type details' }),
      )
      const upper = await screen.findByRole('button', { name: 'Uppercase' })
      act(() => upper.focus())
      await userEvent.keyboard('{ArrowRight}{ArrowRight}')
      await userEvent.tab({ shift: true })

      expect(
        screen.getByRole('button', { name: 'No decoration' }),
      ).toHaveFocus()
    })

    it('returns to the lit button on Shift+Tab once focus has left the row', async () => {
      const { write } = recorder()
      renderDetails(write, { textTransform: 'uppercase' })

      await userEvent.click(
        screen.getByRole('button', { name: 'Type details' }),
      )
      const upper = await screen.findByRole('button', { name: 'Uppercase' })
      act(() => upper.focus())
      await userEvent.keyboard('{ArrowRight}{ArrowRight}')
      await userEvent.tab()
      await userEvent.tab({ shift: true })

      expect(upper).toHaveFocus()
    })

    it('closes on one Escape from a button showing its tooltip', async () => {
      const { write } = recorder()
      renderDetails(write)
      const button = screen.getByRole('button', { name: 'Type details' })

      await userEvent.click(button)
      await screen.findByRole('dialog', { name: 'Type details' })
      await userEvent.tab()
      expect(
        screen.getByRole('button', { name: 'No decoration' }),
      ).toHaveFocus()
      await userEvent.keyboard('{Escape}')

      await waitFor(() =>
        expect(
          screen.queryByRole('dialog', { name: 'Type details' }),
        ).toBeNull(),
      )
      expect(button).toHaveFocus()
    })

    it('closes on a press outside it', async () => {
      const { write } = recorder()
      renderDetails(write)

      await userEvent.click(
        screen.getByRole('button', { name: 'Type details' }),
      )
      await screen.findByRole('dialog', { name: 'Type details' })
      await userEvent.click(screen.getByRole('heading', { name: 'Typography' }))

      await waitFor(() =>
        expect(
          screen.queryByRole('dialog', { name: 'Type details' }),
        ).toBeNull(),
      )
    })

    it('closes on Escape and hands focus back to its button', async () => {
      const { write } = recorder()
      renderDetails(write)
      const button = screen.getByRole('button', { name: 'Type details' })

      await userEvent.click(button)
      await screen.findByRole('dialog', { name: 'Type details' })
      await userEvent.keyboard('{Escape}')

      await waitFor(() =>
        expect(
          screen.queryByRole('dialog', { name: 'Type details' }),
        ).toBeNull(),
      )
      expect(button).toHaveFocus()
    })
  })
})
