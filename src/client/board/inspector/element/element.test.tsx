import '../../../styles.css'

import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TooltipProvider } from '@/client/components/ui/tooltip'
import { liveStore, receiveBoard, receiveClaims } from '@/client/live/store'
import type { StyleValue } from '@/shared/records/elements'
import type { TokenRow } from '@/shared/records/tokens'
import { boardOf, frameOf, pageOf } from '@/test/board'

import { dropWaiting } from '../../claims/waiting'
import {
  clear,
  createSelectionStore,
  select,
  selectElement,
  selectionStore,
} from '../../selection'
import { InspectorPanel } from '../panel'
import { SelectionColors } from '../selection-colors'
import { AppearanceSection } from './appearance'
import { FillSection } from './fill'
import { ShadowSection } from './shadow'
import { StrokeSection } from './stroke'
import { useLiveElement } from './styles'
import { TextSection } from './text'
import { TypographySection } from './typography'
import {
  type ElementChange,
  forgetText,
  type Refusal,
  type WriteElement,
  writeElement,
} from './write'

function tokenOf(name: string, light: string, dark = light): TokenRow {
  return { name, group: 'color', light, dark, sheet: 'tokens.css' }
}

const PRIMARY = tokenOf('--primary', '#4f46e5', '#818cf8')
const BORDER = tokenOf('--border', '#e5e7eb', '#374151')
const SHADOW: TokenRow = {
  name: '--shadow-sm',
  group: 'other',
  light: '0 1px 2px rgba(0,0,0,.1)',
  dark: '0 1px 2px rgba(0,0,0,.5)',
  sheet: 'tokens.css',
}

/** The kit's tooltip popup, apart from a caption carrying the same words. */
const TOOLTIP = '[data-slot="tooltip-content"]'

function tokenValueOf(token: string, percent = 100): StyleValue {
  return { value: `var(${token})`, token, percent }
}

/** A write that records each change and answers as the server would. */
function recorder(answer = true) {
  const changes: ElementChange[] = []
  const write = async (change: ElementChange) => {
    changes.push(change)
    return answer
  }
  return { changes, write }
}

/** Types into a field the way a browser undo does: a value change tagged with its history input type. */
function browserHistory(
  field: HTMLInputElement | HTMLTextAreaElement,
  value: string,
  inputType: 'historyUndo' | 'historyRedo' = 'historyUndo',
) {
  const proto = Object.getPrototypeOf(field)
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(field, value)
  act(() => {
    field.dispatchEvent(new InputEvent('input', { bubbles: true, inputType }))
  })
}

/**
 * Drags a scrub area right by `moves` steps of base-ui's default two
 * pixels, as a locked pointer reports them, and releases it.
 */
function scrubBy(area: HTMLElement, moves: number) {
  act(() => {
    area.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        button: 0,
        pointerType: 'mouse',
      }),
    )
  })
  for (let move = 0; move < moves; move++) {
    act(() => {
      window.dispatchEvent(
        new PointerEvent('pointermove', { bubbles: true, movementX: 2 }),
      )
    })
  }
  act(() => {
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
  })
}

describe('AppearanceSection', () => {
  it('scrubs the opacity from its caption, writing once on release', () => {
    const { changes, write } = recorder()
    render(
      <AppearanceSection
        opacity={0.5}
        radius={0}
        disabled={false}
        write={write}
      />,
    )

    scrubBy(screen.getByText('Opacity'), 3)

    expect(changes).toEqual([
      { kind: 'style', property: 'opacity', value: '0.56' },
    ])
  })

  it('scrubs the radius from its caption', () => {
    const { changes, write } = recorder()
    render(
      <AppearanceSection
        opacity={1}
        radius={4}
        disabled={false}
        write={write}
      />,
    )

    scrubBy(screen.getByText('Corner radius'), 1)

    expect(changes).toEqual([
      { kind: 'style', property: 'border-radius', value: '6px' },
    ])
  })

  it.each(['50', '50%'])('writes opacity 0.5 for %s', async (typed) => {
    const { changes, write } = recorder()
    render(
      <AppearanceSection
        opacity={1}
        radius={0}
        disabled={false}
        write={write}
      />,
    )

    const field = screen.getByRole('textbox', { name: 'Opacity' })
    await userEvent.clear(field)
    await userEvent.type(field, `${typed}{Enter}`)

    expect(changes).toEqual([
      { kind: 'style', property: 'opacity', value: '0.5' },
    ])
  })

  it('writes the radius in px', async () => {
    const { changes, write } = recorder()
    render(
      <AppearanceSection
        opacity={1}
        radius={0}
        disabled={false}
        write={write}
      />,
    )

    const field = screen.getByRole('textbox', { name: 'Corner radius' })
    await userEvent.clear(field)
    await userEvent.type(field, '8{Enter}')

    expect(changes).toEqual([
      { kind: 'style', property: 'border-radius', value: '8px' },
    ])
  })

  it('writes a held opacity step once, as a fraction', async () => {
    const { changes, write } = recorder()
    render(
      <AppearanceSection
        opacity={0.5}
        radius={0}
        disabled={false}
        write={write}
      />,
    )

    await userEvent.click(screen.getByRole('textbox', { name: 'Opacity' }))
    await userEvent.keyboard('{ArrowUp>3/}')

    expect(changes).toEqual([
      { kind: 'style', property: 'opacity', value: '0.53' },
    ])
  })

  it('writes nothing for an opacity that is not a number', async () => {
    const { changes, write } = recorder()
    render(
      <AppearanceSection
        opacity={1}
        radius={0}
        disabled={false}
        write={write}
      />,
    )

    const field = screen.getByRole('textbox', { name: 'Opacity' })
    await userEvent.clear(field)
    await userEvent.type(field, 'half{Enter}')

    expect(changes).toEqual([])
  })
})

describe('TypographySection', () => {
  const FONT_TEXT: TokenRow = {
    name: '--font-text',
    group: 'font',
    light: 'Geist, sans-serif',
    dark: null,
    sheet: 'tokens.css',
  }
  const FONT_SIZE: TokenRow = {
    name: '--font-size-sm',
    group: 'font',
    light: '12px',
    dark: null,
    sheet: 'tokens.css',
  }

  it('shows a family a token sets by the token, and writes nothing for that token', async () => {
    const { changes, write } = recorder()
    render(
      <TypographySection
        fonts={[FONT_TEXT]}
        fontFamily="Geist, sans-serif"
        fontSize={30}
        fontWeight={700}
        textAlign="left"
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
        fontSize={30}
        fontWeight={400}
        textAlign="left"
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
        fontSize={30}
        fontWeight={400}
        textAlign="left"
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

  it('lists the font tokens holding a family ahead of the faces, leaving a size out', async () => {
    const { write } = recorder()
    render(
      <TypographySection
        fonts={[FONT_SIZE, FONT_TEXT]}
        fontFamily="Geist, sans-serif"
        fontSize={30}
        fontWeight={400}
        textAlign="left"
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
      'Caveat',
    ])
  })

  it('shows a family the menu does not hold as written', () => {
    const { write } = recorder()
    render(
      <TypographySection
        fonts={[FONT_TEXT]}
        fontFamily='"Inter Tight", sans-serif'
        fontSize={30}
        fontWeight={400}
        textAlign="left"
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
        fontSize={30}
        fontWeight={700}
        textAlign="left"
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
        fontSize={30}
        fontWeight={700}
        textAlign="left"
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
        fontSize={30}
        fontWeight={700}
        textAlign="left"
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
        fontSize={30}
        fontWeight={400}
        textAlign="left"
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

  it('shows a weight the face lacks as its number', () => {
    const { write } = recorder()
    render(
      <TypographySection
        fonts={[]}
        fontFamily="Caveat, cursive"
        fontSize={30}
        fontWeight={900}
        textAlign="left"
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
        fontSize={30}
        fontWeight={700}
        textAlign="left"
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

  it('captions the alignment buttons as a group', () => {
    const { write } = recorder()
    render(
      <TypographySection
        fonts={[]}
        fontFamily="Geist, sans-serif"
        fontSize={30}
        fontWeight={700}
        textAlign="left"
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
    ).toHaveLength(3)
  })

  it('names an alignment button in a tooltip on hover', async () => {
    const { write } = recorder()
    render(
      <TypographySection
        fonts={[]}
        fontFamily="Geist, sans-serif"
        fontSize={30}
        fontWeight={700}
        textAlign="left"
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
        fontSize={30}
        fontWeight={700}
        textAlign="left"
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
        fontSize={30}
        fontWeight={700}
        textAlign="left"
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
        fontSize={30}
        fontWeight={700}
        textAlign="left"
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
        fontSize={30}
        fontWeight={700}
        textAlign="left"
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
        fontSize={30}
        fontWeight={700}
        textAlign="left"
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
        fontSize={30}
        fontWeight={700}
        textAlign="left"
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
})

describe('FillSection', () => {
  it.each([
    [true, false, { property: 'background-color', value: '' }],
    [true, true, { property: 'background', value: '' }],
    [false, false, { property: 'background-color', value: 'transparent' }],
  ])(
    'removes a background (own %s, shorthand %s) by writing %o',
    async (inline, shorthand, written) => {
      const { changes, write } = recorder()
      render(
        <FillSection
          textOnly={false}
          color={null}
          backgroundColor={tokenValueOf('--primary')}
          tokens={[PRIMARY]}
          theme="light"
          inline={inline}
          shorthand={shorthand}
          disabled={false}
          write={write}
        />,
      )

      await userEvent.click(screen.getByRole('button', { name: 'Remove fill' }))

      expect(changes).toEqual([{ kind: 'style', ...written }])
    },
  )

  it('removes an element’s own text color', async () => {
    const { changes, write } = recorder()
    render(
      <FillSection
        textOnly
        color={tokenValueOf('--primary')}
        backgroundColor={null}
        tokens={[PRIMARY]}
        theme="light"
        inline
        disabled={false}
        write={write}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Remove fill' }))

    expect(changes).toEqual([{ kind: 'style', property: 'color', value: '' }])
  })

  it('offers no remove on a text color a rule sets', () => {
    render(
      <FillSection
        textOnly
        color={tokenValueOf('--primary')}
        backgroundColor={null}
        tokens={[PRIMARY]}
        theme="light"
        inline={false}
        disabled={false}
        write={recorder().write}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Remove fill' })).toBeNull()
  })

  it('reads a transparent background as no fill', () => {
    render(
      <FillSection
        textOnly={false}
        color={null}
        backgroundColor={{ value: 'transparent', token: null, percent: 100 }}
        tokens={[PRIMARY]}
        theme="light"
        inline
        disabled={false}
        write={recorder().write}
      />,
    )

    expect(screen.queryByLabelText('Fill color')).toBeNull()
    expect(screen.getByRole('button', { name: 'Add fill' })).toBeEnabled()
  })

  it('writes color on an element holding text alone', async () => {
    const { changes, write } = recorder()
    render(
      <FillSection
        textOnly
        color={tokenValueOf('--primary')}
        backgroundColor={null}
        tokens={[PRIMARY, BORDER]}
        theme="light"
        inline={false}
        disabled={false}
        write={write}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Fill token' }))
    await userEvent.click(
      within(
        await screen.findByRole('list', { name: 'Fill tokens' }),
      ).getByRole('button', { name: 'border' }),
    )

    expect(changes).toEqual([
      { kind: 'style', property: 'color', value: 'var(--border)' },
    ])
  })

  it('adds the first color token as background-color on any other element', async () => {
    const { changes, write } = recorder()
    render(
      <FillSection
        textOnly={false}
        color={tokenValueOf('--primary')}
        backgroundColor={null}
        tokens={[PRIMARY, BORDER]}
        theme="light"
        inline={false}
        disabled={false}
        write={write}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Add fill' }))

    expect(changes).toEqual([
      {
        kind: 'style',
        property: 'background-color',
        value: 'var(--primary)',
      },
    ])
  })

  it('writes fill opacity below 100 as color-mix() over the token', async () => {
    const { changes, write } = recorder()
    render(
      <FillSection
        textOnly={false}
        color={null}
        backgroundColor={tokenValueOf('--primary')}
        tokens={[PRIMARY]}
        theme="light"
        inline={false}
        disabled={false}
        write={write}
      />,
    )

    const field = screen.getByRole('textbox', { name: 'Fill opacity' })
    await userEvent.clear(field)
    await userEvent.type(field, '50{Enter}')

    expect(changes).toEqual([
      {
        kind: 'style',
        property: 'background-color',
        value: 'color-mix(in srgb, var(--primary) 50%, transparent)',
      },
    ])
  })

  it('scrubs fill opacity from its number, previewing and writing once on release', () => {
    const { changes, write } = recorder()
    const previews: (string | null)[] = []
    render(
      <FillSection
        textOnly={false}
        color={null}
        backgroundColor={tokenValueOf('--primary', 50)}
        tokens={[PRIMARY]}
        theme="light"
        inline={false}
        disabled={false}
        write={write}
        preview={(_property, css) => previews.push(css)}
      />,
    )

    scrubBy(screen.getByRole('textbox', { name: 'Fill opacity' }), 3)

    expect(previews.at(-1)).toBe(
      'color-mix(in srgb, var(--primary) 56%, transparent)',
    )
    expect(changes).toEqual([
      {
        kind: 'style',
        property: 'background-color',
        value: 'color-mix(in srgb, var(--primary) 56%, transparent)',
      },
    ])
  })

  it('puts the stored fill back on Esc mid-scrub and writes nothing', async () => {
    const { changes, write } = recorder()
    const previews: (string | null)[] = []
    render(
      <FillSection
        textOnly={false}
        color={null}
        backgroundColor={tokenValueOf('--primary', 50)}
        tokens={[PRIMARY]}
        theme="light"
        inline={false}
        disabled={false}
        write={write}
        preview={(_property, css) => previews.push(css)}
      />,
    )
    const field = screen.getByRole('textbox', { name: 'Fill opacity' })

    act(() => {
      field.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          button: 0,
          pointerType: 'mouse',
        }),
      )
    })
    act(() => {
      window.dispatchEvent(
        new PointerEvent('pointermove', { bubbles: true, movementX: 2 }),
      )
    })
    await userEvent.keyboard('{Escape}')
    act(() => {
      window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
    })

    expect(previews.at(-1)).toBeNull()
    expect(changes).toEqual([])
  })

  it('scrubs nothing on a fill opacity no color-mix() can carry', () => {
    const { changes, write } = recorder()
    render(
      <FillSection
        textOnly={false}
        color={null}
        backgroundColor={{ value: 'red', token: null, percent: 100 }}
        tokens={[PRIMARY]}
        theme="light"
        inline={false}
        disabled={false}
        write={write}
      />,
    )
    const field = screen.getByRole('textbox', { name: 'Fill opacity' })

    scrubBy(field, 3)

    expect(field).toBeDisabled()
    expect(changes).toEqual([])
  })

  it('writes a raw hex below 100 with an alpha pair', async () => {
    const { changes, write } = recorder()
    render(
      <FillSection
        textOnly={false}
        color={null}
        backgroundColor={{ value: '#111827', token: null, percent: 100 }}
        tokens={[PRIMARY]}
        theme="light"
        inline={false}
        disabled={false}
        write={write}
      />,
    )

    const field = screen.getByRole('textbox', { name: 'Fill opacity' })
    await userEvent.clear(field)
    await userEvent.type(field, '50{Enter}')

    expect(changes).toEqual([
      { kind: 'style', property: 'background-color', value: '#11182780' },
    ])
  })

  it('detaches a token to its value in the frame’s theme', async () => {
    const { changes, write } = recorder()
    render(
      <FillSection
        textOnly={false}
        color={null}
        backgroundColor={tokenValueOf('--primary')}
        tokens={[PRIMARY]}
        theme="dark"
        inline={false}
        disabled={false}
        write={write}
      />,
    )

    await userEvent.click(
      screen.getByRole('button', { name: 'Detach primary' }),
    )

    expect(changes).toEqual([
      { kind: 'style', property: 'background-color', value: '#818cf8' },
    ])
  })

  it('writes a hex typed in the picker once, on Enter', async () => {
    const { changes, write } = recorder()
    render(
      <FillSection
        textOnly={false}
        color={null}
        backgroundColor={{ value: '#111827', token: null, percent: 100 }}
        tokens={[PRIMARY]}
        theme="light"
        inline={false}
        disabled={false}
        write={write}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Fill color' }))
    const hex = await screen.findByRole('textbox', { name: 'Hex' })
    expect(hex).toHaveValue('111827')
    await userEvent.clear(hex)
    await userEvent.type(hex, 'FF0000{Enter}')

    expect(changes).toEqual([
      { kind: 'style', property: 'background-color', value: '#ff0000' },
    ])
    expect(screen.queryByRole('textbox', { name: 'Hex' })).toBeNull()
  })

  it('flags a raw value and names a token with its chip', () => {
    render(
      <>
        <FillSection
          textOnly
          color={{ value: '#111827', token: null, percent: 100 }}
          backgroundColor={null}
          tokens={[PRIMARY]}
          theme="light"
          inline={false}
          disabled={false}
          write={recorder().write}
        />
        <StrokeSection
          bordered
          borderColor={tokenValueOf('--border')}
          tokens={[PRIMARY, BORDER]}
          theme="light"
          inline={false}
          disabled={false}
          write={recorder().write}
        />
      </>,
    )

    expect(
      screen.getByRole('img', { name: 'Raw value, not a token' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Fill token' }),
    ).toHaveTextContent('111827')
    expect(
      screen.getByRole('button', { name: 'Stroke token' }),
    ).toHaveTextContent('border')
  })
})

describe('StrokeSection', () => {
  it.each([
    [true, { property: 'border', value: '' }],
    [false, { property: 'border-style', value: 'none' }],
  ])(
    'removes a stroke the element’s own style sets (%s)',
    async (inline, written) => {
      const { changes, write } = recorder()
      render(
        <StrokeSection
          bordered
          borderColor={tokenValueOf('--border')}
          tokens={[PRIMARY, BORDER]}
          theme="light"
          inline={inline}
          disabled={false}
          write={write}
        />,
      )

      await userEvent.click(
        screen.getByRole('button', { name: 'Remove stroke' }),
      )

      expect(changes).toEqual([{ kind: 'style', ...written }])
    },
  )

  it('scrubs stroke opacity from its number, previewing the border color', () => {
    const { changes, write } = recorder()
    const previews: (string | null)[] = []
    render(
      <StrokeSection
        bordered
        borderColor={tokenValueOf('--border', 50)}
        tokens={[PRIMARY, BORDER]}
        theme="light"
        inline={false}
        disabled={false}
        write={write}
        preview={(property, css) => previews.push(`${property}: ${css}`)}
      />,
    )

    scrubBy(screen.getByRole('textbox', { name: 'Stroke opacity' }), 1)

    expect(previews.at(-1)).toBe(
      'border-color: color-mix(in srgb, var(--border) 52%, transparent)',
    )
    expect(changes).toEqual([
      {
        kind: 'style',
        property: 'border-color',
        value: 'color-mix(in srgb, var(--border) 52%, transparent)',
      },
    ])
  })

  it('adds a 1px border in the border token', async () => {
    const { changes, write } = recorder()
    render(
      <StrokeSection
        bordered={false}
        borderColor={null}
        tokens={[PRIMARY, BORDER]}
        theme="light"
        inline={false}
        disabled={false}
        write={write}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Add stroke' }))

    expect(changes).toEqual([
      { kind: 'style', property: 'border', value: '1px solid var(--border)' },
    ])
  })

  it('shows no color row and enables Add stroke on an element with no border', () => {
    render(
      <StrokeSection
        bordered={false}
        borderColor={null}
        tokens={[PRIMARY, BORDER]}
        theme="light"
        inline={false}
        disabled={false}
        write={recorder().write}
      />,
    )

    expect(screen.queryByLabelText('Stroke color')).toBeNull()
    expect(screen.getByRole('button', { name: 'Add stroke' })).toBeEnabled()
  })

  it('shows the color row and disables Add stroke on a bordered element', () => {
    render(
      <StrokeSection
        bordered
        borderColor={tokenValueOf('--border')}
        tokens={[PRIMARY, BORDER]}
        theme="light"
        inline={false}
        disabled={false}
        write={recorder().write}
      />,
    )

    expect(screen.getByLabelText('Stroke color')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add stroke' })).toBeDisabled()
  })

  it('writes the border color through its row', async () => {
    const { changes, write } = recorder()
    render(
      <StrokeSection
        bordered
        borderColor={tokenValueOf('--border')}
        tokens={[PRIMARY, BORDER]}
        theme="light"
        inline={false}
        disabled={false}
        write={write}
      />,
    )

    await userEvent.click(
      await screen.findByRole('button', { name: 'Stroke token' }),
    )
    await userEvent.click(
      within(
        await screen.findByRole('list', { name: 'Stroke tokens' }),
      ).getByRole('button', { name: 'primary' }),
    )

    expect(changes).toEqual([
      { kind: 'style', property: 'border-color', value: 'var(--primary)' },
    ])
  })
})

describe('ShadowSection', () => {
  it('writes a shadow token', async () => {
    const { changes, write } = recorder()
    render(
      <ShadowSection
        boxShadow={null}
        shadows={[SHADOW]}
        theme="light"
        disabled={false}
        write={write}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Shadow' }))
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'shadow-sm' }),
    )

    expect(changes).toEqual([
      { kind: 'style', property: 'box-shadow', value: 'var(--shadow-sm)' },
    ])
  })

  it('writes none for None, which also covers a shadow a rule sets', async () => {
    const { changes, write } = recorder()
    render(
      <ShadowSection
        boxShadow={tokenValueOf('--shadow-sm')}
        shadows={[SHADOW]}
        theme="light"
        disabled={false}
        write={write}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Shadow' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'None' }))

    expect(changes).toEqual([
      { kind: 'style', property: 'box-shadow', value: 'none' },
    ])
  })

  it('writes nothing for None while no shadow is set', async () => {
    const { changes, write } = recorder()
    render(
      <ShadowSection
        boxShadow={null}
        shadows={[SHADOW]}
        theme="light"
        disabled={false}
        write={write}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Shadow' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'None' }))

    expect(changes).toEqual([])
  })
})

describe('TextSection', () => {
  const AT = { frame: 'studio/home/hero', index: 5 }

  afterEach(() => {
    forgetText(AT)
  })

  /** A write answered as the route answers an edit the agent's write to the element refused. */
  function colliding(moved = false): WriteElement {
    return (change) =>
      writeElement('studio/home', { ...AT, hash: 'a'.repeat(64) }, change, {
        selection: createSelectionStore(),
        send: async () =>
          Response.json(
            {
              ok: false,
              error: {
                code: 'stale-address',
                message:
                  'the agent changed this <h1> in hero.html while your edit waited, so nothing was written',
                details: { ref: AT.frame, index: AT.index, moved },
              },
            },
            { status: 409 },
          ),
        notify: () => {},
      })
  }

  it('keeps no draft once the agent’s write also moved the element’s index', async () => {
    await colliding(true)({ kind: 'text', value: 'Welcome' })

    render(
      <TextSection
        text="Hello"
        disabled={false}
        write={recorder().write}
        element={AT}
      />,
    )

    expect(screen.getByRole('textbox', { name: 'Text' })).toHaveValue('Hello')
    expect(screen.queryByRole('textbox', { name: 'Name' })).toBeNull()
  })

  it('holds its height as the field takes and loses focus, so the sections below stay still', async () => {
    render(
      <TextSection
        text="Hello"
        disabled={false}
        write={recorder().write}
        element={AT}
      />,
    )
    const section = screen.getByRole('region', { name: 'Text' })
    const before = section.getBoundingClientRect().height

    await userEvent.click(screen.getByRole('textbox', { name: 'Text' }))

    expect(screen.getByText(/to apply/)).toBeVisible()
    expect(section.getBoundingClientRect().height).toBe(before)
  })

  it('sets the key hint clear of the focused field’s 3px ring', async () => {
    render(
      <TextSection
        text="Hello"
        disabled={false}
        write={recorder().write}
        element={AT}
      />,
    )
    const area = screen.getByRole('textbox', { name: 'Text' })

    await userEvent.click(area)

    const hint = screen.getByText(/to apply/).getBoundingClientRect()
    expect(
      hint.top - area.getBoundingClientRect().bottom,
    ).toBeGreaterThanOrEqual(8)
  })

  it('keeps the typed text as a draft once the agent changed the element', async () => {
    render(
      <TextSection
        text="Hello"
        disabled={false}
        write={colliding()}
        element={AT}
      />,
    )

    const area = screen.getByRole('textbox', { name: 'Text' })
    await userEvent.clear(area)
    await userEvent.type(area, 'Welcome{Enter}')

    await expect.poll(() => (area as HTMLTextAreaElement).value).toBe('Welcome')
  })

  it('shows the kept draft once the element is selected again, and applies it on Enter', async () => {
    await colliding()({ kind: 'text', value: 'Welcome' })
    const { changes, write } = recorder()

    render(
      <TextSection text="Hello" disabled={false} write={write} element={AT} />,
    )
    const area = screen.getByRole('textbox', { name: 'Text' })
    expect(area).toHaveValue('Welcome')
    await userEvent.type(area, '{Enter}')

    expect(changes).toEqual([{ kind: 'text', value: 'Welcome' }])
  })

  it('forgets the kept draft on Esc', async () => {
    await colliding()({ kind: 'text', value: 'Welcome' })
    const { changes, write } = recorder()
    const { unmount } = render(
      <TextSection text="Hello" disabled={false} write={write} element={AT} />,
    )

    await userEvent.type(
      screen.getByRole('textbox', { name: 'Text' }),
      '{Escape}',
    )
    unmount()
    render(
      <TextSection text="Hello" disabled={false} write={write} element={AT} />,
    )

    expect(screen.getByRole('textbox', { name: 'Text' })).toHaveValue('Hello')
    expect(changes).toEqual([])
  })

  it('writes the text on Cmd+Enter', async () => {
    const { changes, write } = recorder()
    render(
      <TextSection text="Hello" disabled={false} write={write} element={AT} />,
    )

    const area = screen.getByRole('textbox', { name: 'Text' })
    await userEvent.clear(area)
    await userEvent.type(area, 'Welcome{Meta>}{Enter}{/Meta}')

    expect(changes).toEqual([{ kind: 'text', value: 'Welcome' }])
  })

  it('writes the text once on Enter and keeps nothing for the blur', async () => {
    const { changes, write } = recorder()
    render(
      <TextSection text="Hello" disabled={false} write={write} element={AT} />,
    )

    const area = screen.getByRole('textbox', { name: 'Text' })
    await userEvent.clear(area)
    await userEvent.type(area, 'Welcome{Enter}')
    await userEvent.tab()

    expect(changes).toEqual([{ kind: 'text', value: 'Welcome' }])
  })

  it('adds no line on Shift+Enter', async () => {
    const { changes, write } = recorder()
    render(
      <TextSection text="Hello" disabled={false} write={write} element={AT} />,
    )

    const area = screen.getByRole('textbox', { name: 'Text' })
    await userEvent.type(area, '{Shift>}{Enter}{/Shift}')

    expect(area).toHaveValue('Hello')
    expect(changes).toEqual([])
  })

  it('writes a pasted line break as a space', async () => {
    const { changes, write } = recorder()
    render(
      <TextSection text="Hello" disabled={false} write={write} element={AT} />,
    )

    const area = screen.getByRole('textbox', { name: 'Text' })
    await userEvent.clear(area)
    await userEvent.paste('Two\r\nlines')
    await userEvent.keyboard('{Enter}')

    expect(changes).toEqual([{ kind: 'text', value: 'Two lines' }])
  })

  it('hints the keys only while it has focus', async () => {
    const { write } = recorder()
    render(
      <TextSection text="Hello" disabled={false} write={write} element={AT} />,
    )

    expect(screen.getByText('to apply', { exact: false })).not.toBeVisible()
    await userEvent.click(screen.getByRole('textbox', { name: 'Text' }))

    expect(screen.getByText('to apply', { exact: false })).toBeVisible()
  })

  it('cancels on Esc and writes nothing', async () => {
    const { changes, write } = recorder()
    render(
      <TextSection text="Hello" disabled={false} write={write} element={AT} />,
    )

    const area = screen.getByRole('textbox', { name: 'Text' })
    await userEvent.type(area, ' there{Escape}')

    expect(changes).toEqual([])
    expect(area).toHaveValue('Hello')
  })

  it('shows the stored text again after a refused write', async () => {
    const { write } = recorder(false)
    render(
      <TextSection text="Hello" disabled={false} write={write} element={AT} />,
    )

    const area = screen.getByRole('textbox', { name: 'Text' })
    await userEvent.clear(area)
    await userEvent.type(area, 'Welcome')
    await userEvent.tab()

    await expect.poll(() => (area as HTMLTextAreaElement).value).toBe('Hello')
  })

  it.each(['historyUndo', 'historyRedo'] as const)(
    'drops a %s while the field is unfocused, and writes nothing on the next blur',
    async (inputType) => {
      const { changes, write } = recorder()
      render(
        <TextSection
          text="Hello"
          disabled={false}
          write={write}
          element={AT}
        />,
      )
      const area = screen.getByRole('textbox', { name: 'Text' })

      browserHistory(area as HTMLTextAreaElement, 'Hel', inputType)
      act(() => (area as HTMLTextAreaElement).focus())
      act(() => (area as HTMLTextAreaElement).blur())

      expect(changes).toEqual([])
      expect(area).toHaveValue('Hello')
    },
  )

  it('follows a historyUndo while the field is focused', async () => {
    const { changes, write } = recorder()
    render(
      <TextSection text="Hello" disabled={false} write={write} element={AT} />,
    )
    const area = screen.getByRole('textbox', { name: 'Text' })

    act(() => (area as HTMLTextAreaElement).focus())
    browserHistory(area as HTMLTextAreaElement, 'Hel')
    act(() => (area as HTMLTextAreaElement).blur())

    expect(changes).toEqual([{ kind: 'text', value: 'Hel' }])
  })
})

describe('AppearanceSection commit field', () => {
  it('drops a historyUndo while the field is unfocused', () => {
    const { changes, write } = recorder()
    render(
      <AppearanceSection
        opacity={1}
        radius={0}
        disabled={false}
        write={write}
      />,
    )
    const field = screen.getByRole('textbox', { name: 'Opacity' })

    browserHistory(field as HTMLInputElement, '50')
    act(() => (field as HTMLInputElement).focus())
    act(() => (field as HTMLInputElement).blur())

    expect(changes).toEqual([])
    expect(field).toHaveValue('100%')
  })
})

describe('SelectionColors', () => {
  it('lists each color with its chip or raw hex and the raw flag', () => {
    render(
      <SelectionColors
        colors={[
          { value: '#111827', token: null, percent: 100 },
          tokenValueOf('--primary', 50),
        ]}
        tokens={[PRIMARY]}
        theme="light"
      />,
    )

    const rows = screen.getAllByRole('listitem')
    expect(rows.map((row) => row.textContent)).toEqual([
      '111827100%',
      'primary50%',
    ])
    expect(
      screen.getAllByRole('img', { name: 'Raw value, not a token' }),
    ).toHaveLength(1)
  })
})

describe('writeElement', () => {
  const KEY = { frame: 'studio/home/hero', index: 5, hash: 'a'.repeat(64) }

  function answering(status: number, body: unknown): typeof fetch {
    return async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      })
  }

  it('rekeys the selected element to the answered hash', async () => {
    const selection = createSelectionStore()
    selectElement(selection, 'studio/home', KEY)

    const written = await writeElement(
      'studio/home',
      KEY,
      { kind: 'text', value: 'Welcome' },
      {
        selection,
        send: answering(200, {
          ok: true,
          data: { ref: KEY.frame, index: 5, hash: 'b'.repeat(64) },
        }),
        notify: () => {},
      },
    )

    expect(written).toBe(true)
    expect(selection.getState().element?.hash).toBe('b'.repeat(64))
  })

  it('reselects the element at the index it landed at, once the agent’s reload dropped it', async () => {
    const selection = createSelectionStore()
    selectElement(selection, 'studio/home', KEY)
    select(selection, 'studio/home', [KEY.frame])

    await writeElement(
      'studio/home',
      KEY,
      { kind: 'text', value: 'Welcome' },
      {
        selection,
        send: answering(200, {
          ok: true,
          data: {
            ref: KEY.frame,
            index: 6,
            hash: 'b'.repeat(64),
            from: 'c'.repeat(64),
          },
        }),
        notify: () => {},
      },
    )

    expect(selection.getState().element).toEqual({
      frame: KEY.frame,
      index: 6,
      hash: 'b'.repeat(64),
    })
  })

  it('leaves another element the person selected meanwhile alone', async () => {
    const selection = createSelectionStore()
    const other = { ...KEY, index: 3 }
    selectElement(selection, 'studio/home', other)

    await writeElement(
      'studio/home',
      KEY,
      { kind: 'text', value: 'Welcome' },
      {
        selection,
        send: answering(200, {
          ok: true,
          data: { ref: KEY.frame, index: 6, hash: 'b'.repeat(64) },
        }),
        notify: () => {},
      },
    )

    expect(selection.getState().element).toEqual(other)
  })

  it('keeps a leading file name’s case in the toast', async () => {
    const told: Refusal[] = []

    await writeElement(
      'studio/home',
      KEY,
      { kind: 'style', property: 'opacity', value: '0.5' },
      {
        selection: createSelectionStore(),
        send: answering(409, {
          ok: false,
          error: {
            code: 'stale-address',
            message:
              'stats.html changed after this edit was made, so nothing was written',
          },
        }),
        notify: (refusal) => told.push(refusal),
      },
    )

    expect(told[0]?.description).toBe(
      'stats.html changed after this edit was made, so nothing was written.',
    )
  })

  it('tells a text edit the agent collided with that Enter applies it anyway, with a copy of the text', async () => {
    const told: Refusal[] = []

    await writeElement(
      'studio/home',
      KEY,
      { kind: 'text', value: 'Welcome' },
      {
        selection: createSelectionStore(),
        send: answering(409, {
          ok: false,
          error: {
            code: 'stale-address',
            message:
              'the agent changed this <h1> in stats.html while your edit waited, so nothing was written',
            details: { ref: KEY.frame, index: KEY.index, moved: false },
          },
        }),
        notify: (refusal) => told.push(refusal),
      },
    )
    forgetText(KEY)

    expect(told).toEqual([
      {
        title: 'Edit not saved',
        description:
          'The agent changed this <h1> in stats.html while your edit waited, so nothing was written. Press Enter to apply your text anyway.',
        copy: 'Welcome',
      },
    ])
  })

  it('offers only the copy once the element’s index moved, since Enter would write elsewhere', async () => {
    const told: Refusal[] = []

    await writeElement(
      'studio/home',
      KEY,
      { kind: 'text', value: 'Welcome' },
      {
        selection: createSelectionStore(),
        send: answering(409, {
          ok: false,
          error: {
            code: 'stale-address',
            message:
              'the agent changed this <h1> in stats.html while your edit waited, so nothing was written',
            details: { ref: KEY.frame, index: KEY.index, moved: true },
          },
        }),
        notify: (refusal) => told.push(refusal),
      },
    )

    expect(told).toEqual([
      {
        title: 'Edit not saved',
        description:
          'The agent changed this <h1> in stats.html while your edit waited, so nothing was written.',
        copy: 'Welcome',
      },
    ])
  })

  it('raises the refusal and keeps the selection on a stale edit', async () => {
    const selection = createSelectionStore()
    selectElement(selection, 'studio/home', KEY)
    const told: Refusal[] = []

    const written = await writeElement(
      'studio/home',
      KEY,
      { kind: 'style', property: 'opacity', value: '0.5' },
      {
        selection,
        send: answering(409, {
          ok: false,
          error: {
            code: 'stale-address',
            message:
              'hero.html changed after this edit was made, so nothing was written',
          },
        }),
        notify: (refusal) => told.push(refusal),
      },
    )

    expect(written).toBe(false)
    expect(told).toEqual([
      {
        title: 'Edit not saved',
        description:
          'hero.html changed after this edit was made, so nothing was written.',
      },
    ])
    expect(selection.getState().element).toEqual(KEY)
  })

  describe('on a frame another session holds', () => {
    const OPACITY: ElementChange = {
      kind: 'style',
      property: 'opacity',
      value: '0.5',
    }
    const RADIUS: ElementChange = {
      kind: 'style',
      property: 'border-radius',
      value: '8px',
    }
    let sent: { hash: string; change: ElementChange }[]
    /** Answers each edit with the next hash, as the frame's bytes change. */
    const server: typeof fetch = async (_path, init) => {
      const body = JSON.parse(String(init?.body))
      sent.push({ hash: body.hash, change: body.change })
      return Response.json({
        ok: true,
        data: {
          ref: KEY.frame,
          index: 5,
          hash: String(sent.length).repeat(64),
        },
      })
    }

    beforeEach(() => {
      sent = []
      liveStore.setState({ connected: true })
      receiveClaims(liveStore, [
        {
          frame: KEY.frame,
          session: 'sess-a',
          agent: 'claude',
          tag: 'claude · visual-style',
          claimedAt: '2026-10-19T10:00:00.000Z',
          expiresAt: '2099-10-19T10:05:00.000Z',
        },
      ])
    })

    afterEach(() => {
      dropWaiting()
      receiveClaims(liveStore, [])
    })

    it('waits, then sends once the claim is released', async () => {
      const selection = createSelectionStore()
      selectElement(selection, 'studio/home', KEY)

      const written = writeElement('studio/home', KEY, OPACITY, {
        selection,
        send: server,
        notify: () => {},
      })
      await Promise.resolve()
      expect(sent).toEqual([])

      receiveClaims(liveStore, [])

      expect(await written).toBe(true)
      expect(sent).toEqual([{ hash: KEY.hash, change: OPACITY }])
    })

    it('sends two waiting edits in order, the second from the hash the first left', async () => {
      const selection = createSelectionStore()
      selectElement(selection, 'studio/home', KEY)
      const deps = { selection, send: server, notify: () => {} }

      const first = writeElement('studio/home', KEY, OPACITY, deps)
      const second = writeElement('studio/home', KEY, RADIUS, deps)
      receiveClaims(liveStore, [])

      expect(await Promise.all([first, second])).toEqual([true, true])
      expect(sent).toEqual([
        { hash: KEY.hash, change: OPACITY },
        { hash: '1'.repeat(64), change: RADIUS },
      ])
    })

    describe('behind an edit the server found again elsewhere', () => {
      let sentAt: { index: number; hash: string }[]
      /** Lands the first edit at index 6 over the agent's bytes, and each later one where it was sent. */
      const relocating: typeof fetch = async (_path, init) => {
        const body = JSON.parse(String(init?.body))
        sentAt.push({ index: body.index, hash: body.hash })
        const first = sentAt.length === 1
        return Response.json({
          ok: true,
          data: {
            ref: KEY.frame,
            index: first ? 6 : body.index,
            hash: String(sentAt.length).repeat(64),
            from: first ? 'c'.repeat(64) : body.hash,
          },
        })
      }

      beforeEach(() => {
        sentAt = []
      })

      it('sends a follower on the same element at the index the first landed at, from its hash', async () => {
        const deps = {
          selection: createSelectionStore(),
          send: relocating,
          notify: () => {},
        }

        const first = writeElement('studio/home', KEY, OPACITY, deps)
        const second = writeElement('studio/home', KEY, RADIUS, deps)
        receiveClaims(liveStore, [])

        expect(await Promise.all([first, second])).toEqual([true, true])
        expect(sentAt).toEqual([
          { index: 5, hash: KEY.hash },
          { index: 6, hash: '1'.repeat(64) },
        ])
      })

      it('sends a follower on another element from its own hash, for the server to find again', async () => {
        const deps = {
          selection: createSelectionStore(),
          send: relocating,
          notify: () => {},
        }

        const first = writeElement('studio/home', KEY, OPACITY, deps)
        const second = writeElement(
          'studio/home',
          { ...KEY, index: 3 },
          RADIUS,
          deps,
        )
        receiveClaims(liveStore, [])

        expect(await Promise.all([first, second])).toEqual([true, true])
        expect(sentAt).toEqual([
          { index: 5, hash: KEY.hash },
          { index: 3, hash: KEY.hash },
        ])
      })

      it('keeps a third edit on the first element at its new index past one on another', async () => {
        const deps = {
          selection: createSelectionStore(),
          send: relocating,
          notify: () => {},
        }

        const first = writeElement('studio/home', KEY, OPACITY, deps)
        const second = writeElement(
          'studio/home',
          { ...KEY, index: 3 },
          RADIUS,
          deps,
        )
        const third = writeElement(
          'studio/home',
          KEY,
          { kind: 'text', value: 'Welcome' },
          deps,
        )
        receiveClaims(liveStore, [])

        expect(await Promise.all([first, second, third])).toEqual([
          true,
          true,
          true,
        ])
        expect(sentAt[2]).toEqual({ index: 6, hash: '2'.repeat(64) })
      })
    })

    it('answers false with the stale toast when the agent wrote the frame meanwhile', async () => {
      const selection = createSelectionStore()
      selectElement(selection, 'studio/home', KEY)
      const told: Refusal[] = []

      const written = writeElement('studio/home', KEY, OPACITY, {
        selection,
        send: answering(409, {
          ok: false,
          error: {
            code: 'stale-address',
            message:
              'hero.html changed after this edit was made, so nothing was written',
          },
        }),
        notify: (refusal) => told.push(refusal),
      })
      receiveClaims(liveStore, [])

      expect(await written).toBe(false)
      expect(told).toEqual([
        {
          title: 'Edit not saved',
          description:
            'hero.html changed after this edit was made, so nothing was written.',
        },
      ])
    })

    it('drops the edits queued behind a refused one without sending them', async () => {
      const selection = createSelectionStore()
      selectElement(selection, 'studio/home', KEY)
      let calls = 0
      const refusing: typeof fetch = async () => {
        calls += 1
        return Response.json(
          {
            ok: false,
            error: { code: 'stale-address', message: 'hero.html changed' },
          },
          { status: 409 },
        )
      }
      const deps = { selection, send: refusing, notify: () => {} }

      const first = writeElement('studio/home', KEY, OPACITY, deps)
      const second = writeElement('studio/home', KEY, RADIUS, deps)
      receiveClaims(liveStore, [])

      expect(await Promise.all([first, second])).toEqual([false, false])
      expect(calls).toBe(1)
    })

    it('answers false and raises nothing when the wait is cancelled', async () => {
      const told: unknown[] = []

      const written = writeElement('studio/home', KEY, OPACITY, {
        selection: createSelectionStore(),
        send: server,
        notify: (refusal) => told.push(refusal),
      })
      dropWaiting()

      expect(await written).toBe(false)
      expect(told).toEqual([])
      expect(sent).toEqual([])
    })
  })
})

describe('InspectorPanel with an element selected', () => {
  const HASH = 'c'.repeat(64)
  const HERO = frameOf('hero', {
    box: { x: 0, y: 0, width: 400, height: 300 },
  })
  let layer: HTMLDivElement | undefined

  // Indices past the skipped injected style: html 0, head 1, body 2, then the body's children.
  async function mountFrame(body: string): Promise<void> {
    layer = document.createElement('div')
    const frame = document.createElement('div')
    frame.dataset.frame = HERO.ref
    const iframe = document.createElement('iframe')
    const loaded = new Promise((resolve) =>
      iframe.addEventListener('load', resolve, { once: true }),
    )
    iframe.srcdoc = `<!doctype html><html><head><style data-frameboard data-hash="${HASH}"></style></head><body>${body}</body></html>`
    frame.append(iframe)
    layer.append(frame)
    document.body.append(layer)
    await loaded
  }

  beforeEach(() => {
    receiveBoard(liveStore, boardOf(pageOf([HERO])))
    liveStore.setState({ canWrite: true })
  })

  afterEach(() => {
    act(() => clear(selectionStore))
    layer?.remove()
    layer = undefined
  })

  function renderWith(index: number) {
    act(() =>
      selectElement(selectionStore, 'studio/home', {
        frame: HERO.ref,
        index,
        hash: HASH,
      }),
    )
    render(
      <TooltipProvider>
        <InspectorPanel />
      </TooltipProvider>,
    )
  }

  it('shows every section for an element holding text alone', async () => {
    await mountFrame('<h1>Hello</h1>')

    renderWith(3)

    const headings = await screen.findAllByRole('heading')
    expect(headings.map((heading) => heading.textContent)).toEqual([
      'Frame',
      'Appearance',
      'Typography',
      'Fill',
      'Text',
      'Stroke',
      'Shadow',
    ])
    expect(screen.getByRole('textbox', { name: 'Text' })).toHaveValue('Hello')
  })

  it('previews a step on the live element and puts it back on Esc', async () => {
    await mountFrame('<h1>Hello</h1>')
    renderWith(3)
    const opacity = await screen.findByRole('textbox', { name: 'Opacity' })
    const headline = () =>
      document
        .querySelector<HTMLIFrameElement>(`[data-frame="${HERO.ref}"] iframe`)
        ?.contentDocument?.querySelector('h1')

    await userEvent.click(opacity)
    await userEvent.keyboard('{ArrowDown>2}')

    expect(headline()?.style.opacity).toBe('0.98')

    await userEvent.keyboard('{Escape}{/ArrowDown}')

    expect(headline()?.hasAttribute('style')).toBe(false)
  })

  it('reads a background color stated alone as no shorthand', async () => {
    await mountFrame(
      '<div style="background-color: red; background-image: none"></div>',
    )
    const { result } = renderHook(() =>
      useLiveElement({ frame: HERO.ref, index: 3, hash: HASH }),
    )

    await waitFor(() => expect(result.current).not.toBeNull())
    expect(result.current?.inline).toMatchObject({
      backgroundColor: true,
      background: false,
    })
  })

  it('reads which paints the element’s own style sets', async () => {
    await mountFrame(
      '<div style="background: red; border-top-color: blue"></div>',
    )
    const { result } = renderHook(() =>
      useLiveElement({ frame: HERO.ref, index: 3, hash: HASH }),
    )

    await waitFor(() => expect(result.current).not.toBeNull())
    expect(result.current?.inline).toEqual({
      color: false,
      backgroundColor: true,
      background: true,
      border: true,
    })
  })

  it('reads a stated line height and letter spacing in px', async () => {
    await mountFrame(
      '<h1 style="font-size: 20px; line-height: 1.5; letter-spacing: 0.1em">Hi</h1>',
    )
    const { result } = renderHook(() =>
      useLiveElement({ frame: HERO.ref, index: 3, hash: HASH }),
    )

    await waitFor(() => expect(result.current).not.toBeNull())
    expect(result.current).toMatchObject({ lineHeight: 30, letterSpacing: 2 })
  })

  it('reads a normal line height as none and normal spacing as 0', async () => {
    await mountFrame('<h1>Hi</h1>')
    const { result } = renderHook(() =>
      useLiveElement({ frame: HERO.ref, index: 3, hash: HASH }),
    )

    await waitFor(() => expect(result.current).not.toBeNull())
    expect(result.current).toMatchObject({ lineHeight: null, letterSpacing: 0 })
  })

  it('leaves Typography out for an element holding no text', async () => {
    await mountFrame('<div></div>')

    renderWith(3)

    await screen.findByRole('heading', { name: 'Appearance' })
    expect(screen.queryByRole('heading', { name: 'Typography' })).toBeNull()
  })

  describe('with the project’s tokens answered', () => {
    // The table groups the shadow with the colors, as the filter exists for.
    const SHADOW_AS_COLOR: TokenRow = { ...SHADOW, group: 'color' }
    const TABLE = {
      sheets: [],
      tokens: [PRIMARY, SHADOW_AS_COLOR],
    }

    beforeEach(() => {
      vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/tokens')) {
          return Response.json({ ok: true, data: TABLE })
        }
        return Response.json({
          ok: true,
          data: {
            ref: HERO.ref,
            hash: HASH,
            element: {
              color: tokenValueOf('--primary'),
              backgroundColor: null,
              borderColor: tokenValueOf('--primary'),
              borderWidth: null,
              boxShadow: null,
            },
            colors: [],
          },
        })
      })
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('previews a color picked for Fill on the live element and puts it back on Esc', async () => {
      await mountFrame('<h1>Hello</h1>')
      renderWith(3)
      const headline = () =>
        document
          .querySelector<HTMLIFrameElement>(`[data-frame="${HERO.ref}"] iframe`)
          ?.contentDocument?.querySelector('h1')

      await userEvent.click(
        await screen.findByRole('button', { name: 'Fill color' }),
      )
      const hex = await screen.findByRole('textbox', { name: 'Hex' })
      expect(hex).toHaveValue('4F46E5')
      await userEvent.clear(hex)
      await userEvent.type(hex, 'FF0000')

      expect(headline()?.style.color).toBe('rgb(255, 0, 0)')

      await userEvent.keyboard('{Escape}')

      expect(headline()?.hasAttribute('style')).toBe(false)
    })

    it('opens the picker on a currentcolor stroke at the element’s text color', async () => {
      vi.stubGlobal('fetch', async (input: RequestInfo | URL) =>
        String(input).includes('/tokens')
          ? Response.json({ ok: true, data: TABLE })
          : Response.json({
              ok: true,
              data: {
                ref: HERO.ref,
                hash: HASH,
                element: {
                  color: null,
                  backgroundColor: null,
                  borderColor: null,
                  borderWidth: null,
                  boxShadow: null,
                },
                colors: [],
              },
            }),
      )
      await mountFrame(
        '<div style="color: #0ea5e9; border: 1px solid currentcolor"></div>',
      )
      renderWith(3)

      await userEvent.click(
        await screen.findByRole('button', { name: 'Stroke color' }),
      )

      expect(await screen.findByRole('textbox', { name: 'Hex' })).toHaveValue(
        '0EA5E9',
      )
    })

    it('offers a shadow token in the Shadow menu and not in the Fill or Stroke menus', async () => {
      await mountFrame('<h1 style="border:1px solid">Hello</h1>')
      renderWith(3)
      await screen.findByRole('heading', { name: 'Appearance' })

      await userEvent.click(
        await screen.findByRole('button', { name: 'Fill token' }),
      )
      const fill = within(
        await screen.findByRole('list', { name: 'Fill tokens' }),
      )
      expect(fill.getByRole('button', { name: 'primary' })).toBeInTheDocument()
      expect(fill.queryByRole('button', { name: 'shadow-sm' })).toBeNull()
      await userEvent.keyboard('{Escape}')

      await userEvent.click(
        screen.getByRole('button', { name: 'Stroke token' }),
      )
      const stroke = within(
        await screen.findByRole('list', { name: 'Stroke tokens' }),
      )
      expect(
        stroke.getByRole('button', { name: 'primary' }),
      ).toBeInTheDocument()
      expect(stroke.queryByRole('button', { name: 'shadow-sm' })).toBeNull()
      await userEvent.keyboard('{Escape}')

      await userEvent.click(screen.getByRole('button', { name: 'Shadow' }))
      expect(
        await screen.findByRole('menuitem', { name: 'shadow-sm' }),
      ).toBeInTheDocument()
    })
  })

  it('hides the frame’s name row while an element is selected', async () => {
    await mountFrame('<h1>Hello</h1>')

    renderWith(3)

    await screen.findByRole('heading', { name: 'Appearance' })
    expect(screen.queryByText('hero')).toBeNull()
  })

  it('leaves the text area out for an element holding text and elements', async () => {
    await mountFrame('<p>Hello <b>there</b></p>')

    renderWith(3)

    await screen.findByRole('heading', { name: 'Typography' })
    expect(screen.queryByRole('heading', { name: 'Text' })).toBeNull()
  })

  it('disables every control while the tab may not write', async () => {
    liveStore.setState({ canWrite: false })
    await mountFrame('<h1>Hello</h1>')

    renderWith(3)

    await screen.findByRole('heading', { name: 'Appearance' })
    const controls = [
      ...screen.getAllByRole('textbox'),
      ...screen
        .getAllByRole('button')
        .filter((button) => button.closest('section')),
    ].filter(
      (control) => !control.closest('[aria-labelledby="inspector-frame"]'),
    )
    expect(controls.length).toBeGreaterThan(5)
    expect(controls.filter((control) => !control.matches(':disabled'))).toEqual(
      [],
    )
  })
})
