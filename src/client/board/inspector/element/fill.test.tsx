import '../../../styles.css'

import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import type { TokenRow } from '@/shared/records/tokens'

import { FillSection } from './fill'
import {
  BORDER,
  PRIMARY,
  recorder,
  scrubBy,
  tokenOf,
  tokenValueOf,
} from './fixtures'
import { StrokeSection } from './stroke'

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

  it.each([
    [
      'a row it cannot focus',
      <div key="row" role="listitem" aria-label="Headline" />,
      'listitem',
    ],
    [
      'a button',
      <button key="button" type="button">
        Headline
      </button>,
      'button',
    ],
  ] as const)(
    'writes a pick once as a press on %s goes down, before it is released into a drag',
    async (_target, outside, role) => {
      const { changes, write } = recorder()
      render(
        <>
          <FillSection
            textOnly={false}
            color={null}
            backgroundColor={{ value: '#111827', token: null, percent: 100 }}
            tokens={[PRIMARY]}
            theme="light"
            inline={false}
            disabled={false}
            write={write}
          />
          {outside}
        </>,
      )
      await userEvent.click(screen.getByRole('button', { name: 'Fill color' }))
      const hex = await screen.findByRole('textbox', { name: 'Hex' })
      await userEvent.clear(hex)
      await userEvent.type(hex, 'FF0000')

      await userEvent.pointer({
        keys: '[MouseLeft>]',
        target: screen.getByRole(role, { name: 'Headline' }),
      })

      expect(changes).toEqual([
        { kind: 'style', property: 'background-color', value: '#ff0000' },
      ])
    },
  )

  it('keeps the picker open and writes nothing for a press in a menu it opened', async () => {
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
    await userEvent.clear(hex)
    await userEvent.type(hex, 'FF0000')

    await userEvent.click(screen.getByRole('button', { name: 'Color format' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'RGB' }))

    expect(changes).toEqual([])
    expect(
      screen.getByRole('dialog', { name: 'Fill color picker' }),
    ).toBeInTheDocument()
  })

  it('names a raw value no token matches by its hex alone, and a token by its chip', () => {
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
      screen.getByRole('button', { name: 'Fill token' }),
    ).toHaveTextContent('111827')
    expect(screen.queryByRole('button', { name: /^Use / })).toBeNull()
    expect(screen.queryByRole('img')).toBeNull()
    expect(
      screen.getByRole('button', { name: 'Stroke token' }),
    ).toHaveTextContent('border')
  })

  describe('a raw value equal to a token', () => {
    function renderFill(
      value: string,
      {
        percent = 100,
        tokens = [PRIMARY],
        theme = 'light',
        disabled = false,
      }: {
        percent?: number
        tokens?: TokenRow[]
        theme?: 'light' | 'dark'
        disabled?: boolean
      } = {},
    ) {
      const { changes, write } = recorder()
      render(
        <FillSection
          textOnly
          color={{ value, token: null, percent }}
          backgroundColor={null}
          tokens={tokens}
          theme={theme}
          inline={false}
          disabled={disabled}
          write={write}
        />,
      )
      return changes
    }

    it('swaps to the token at the row’s percent', async () => {
      const changes = renderFill('#4f46e5', { percent: 28 })

      await userEvent.click(
        screen.getByRole('button', { name: 'Use primary for 4f46e5' }),
      )

      expect(changes).toEqual([
        {
          kind: 'style',
          property: 'color',
          value: 'color-mix(in srgb, var(--primary) 28%, transparent)',
        },
      ])
    })

    it('matches across hex case and an rgb() value', () => {
      renderFill('rgb(79, 70, 229)', {
        tokens: [tokenOf('--primary', '#4F46E5')],
      })

      expect(
        screen.getByRole('button', { name: /^Use primary for / }),
      ).toHaveTextContent('Use primary')
    })

    it('names the first of two equal tokens in sheet order', () => {
      renderFill('#4f46e5', {
        tokens: [tokenOf('--brand', '#4f46e5'), PRIMARY],
      })

      expect(
        screen.getByRole('button', { name: 'Use brand for 4f46e5' }),
      ).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /^Use primary/ })).toBeNull()
    })

    it('matches the token’s value in the theme the frame shows', () => {
      renderFill('#4f46e5', { theme: 'dark' })

      expect(screen.queryByRole('button', { name: /^Use / })).toBeNull()
    })

    it.each([
      ['rgba(79, 70, 229, 0.8)', '#4f46e5'],
      ['#4f4c', '#44ff44'],
    ])(
      'offers nothing for %s, whose alpha the row’s percent does not carry',
      (value, token) => {
        renderFill(value, { tokens: [tokenOf('--primary', token)] })

        expect(screen.queryByRole('button', { name: /^Use / })).toBeNull()
      },
    )

    it('offers nothing where the token itself is translucent', () => {
      renderFill('#4f46e5', {
        tokens: [tokenOf('--primary', 'rgba(79, 70, 229, 0.5)')],
      })

      expect(screen.queryByRole('button', { name: /^Use / })).toBeNull()
    })

    it('offers nothing for a raw value no hex or rgb() states', () => {
      renderFill('indigo', { tokens: [tokenOf('--primary', 'indigo')] })

      expect(screen.queryByRole('button', { name: /^Use / })).toBeNull()
    })

    it('disables the swap where the inspector is disabled', () => {
      renderFill('#4f46e5', { disabled: true })

      expect(
        screen.getByRole('button', { name: 'Use primary for 4f46e5' }),
      ).toBeDisabled()
    })
  })
})
