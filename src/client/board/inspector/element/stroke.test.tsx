import '../../../styles.css'

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { BORDER, PRIMARY, recorder, scrubBy, tokenValueOf } from './fixtures'
import { StrokeSection } from './stroke'
import { type PreviewStyle, type WriteElement } from './write'

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

  it('adds a 1px grey border in a project with no color token', async () => {
    const { changes, write } = recorder()
    render(
      <StrokeSection
        bordered={false}
        borderColor={null}
        tokens={[]}
        theme="light"
        inline={false}
        disabled={false}
        write={write}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Add stroke' }))

    expect(changes).toEqual([
      { kind: 'style', property: 'border', value: '1px solid #808080' },
    ])
  })

  it('disables Add stroke with no color token where the inspector is disabled', () => {
    render(
      <StrokeSection
        bordered={false}
        borderColor={null}
        tokens={[]}
        theme="light"
        inline={false}
        disabled
        write={recorder().write}
      />,
    )

    expect(screen.getByRole('button', { name: 'Add stroke' })).toBeDisabled()
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

  describe('width', () => {
    function renderWidth(
      borderWidth: number | null,
      write: WriteElement,
      preview?: PreviewStyle,
    ) {
      render(
        <StrokeSection
          bordered
          borderColor={tokenValueOf('--border')}
          borderWidth={borderWidth}
          tokens={[PRIMARY, BORDER]}
          theme="light"
          inline={false}
          disabled={false}
          write={write}
          preview={preview}
        />,
      )
      return screen.getByRole('textbox', { name: 'Stroke width' })
    }

    it('shows the element’s border width', () => {
      expect(renderWidth(4, recorder().write)).toHaveValue('4')
    })

    it('writes a typed width, keeping a fraction', async () => {
      const { changes, write } = recorder()
      const field = renderWidth(1, write)

      await userEvent.tripleClick(field)
      await userEvent.keyboard('1.5{Enter}')

      expect(changes).toEqual([
        { kind: 'style', property: 'border-width', value: '1.5px' },
      ])
    })

    it('writes a stepped width once', async () => {
      const { changes, write } = recorder()
      const field = renderWidth(1, write)

      await userEvent.click(field)
      await userEvent.keyboard('{ArrowUp>2/}')

      expect(changes).toEqual([
        { kind: 'style', property: 'border-width', value: '3px' },
      ])
    })

    it('never writes a width below 1px', async () => {
      const { changes, write } = recorder()
      const field = renderWidth(2, write)

      await userEvent.tripleClick(field)
      await userEvent.keyboard('0{Enter}')

      expect(changes).toEqual([
        { kind: 'style', property: 'border-width', value: '1px' },
      ])
    })

    it('reads Mixed on uneven sides and writes one width for all four', async () => {
      const { changes, write } = recorder()
      const field = renderWidth(null, write)
      expect(field).toHaveAttribute('placeholder', 'Mixed')

      await userEvent.tripleClick(field)
      await userEvent.keyboard('2{Enter}')

      expect(changes).toEqual([
        { kind: 'style', property: 'border-width', value: '2px' },
      ])
    })

    it('puts the stored width back on Esc during a step and writes nothing', async () => {
      const { changes, write } = recorder()
      const previews: (string | null)[] = []
      const field = renderWidth(1, write, (property, css) =>
        previews.push(`${property}: ${css}`),
      )

      await userEvent.click(field)
      await userEvent.keyboard('{ArrowUp>3}{Escape}{/ArrowUp}')

      expect(previews.at(-1)).toBe('border-width: null')
      expect(changes).toEqual([])
    })

    it('shows no width field where the caller passes none', () => {
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

      expect(screen.queryByRole('textbox', { name: 'Stroke width' })).toBeNull()
    })
  })
})
