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
  selectElement,
  selectionStore,
} from '../../selection'
import { InspectorPanel } from '../panel'
import { SelectionColors } from '../selection-colors'
import { FillSection } from './fill'
import { LayerSection } from './layer'
import { ShadowSection } from './shadow'
import { StrokeSection } from './stroke'
import { useLiveElement } from './styles'
import { TextSection } from './text'
import { TypographySection } from './typography'
import { type ElementChange, writeElement } from './write'

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

describe('LayerSection', () => {
  it.each(['50', '50%'])('writes opacity 0.5 for %s', async (typed) => {
    const { changes, write } = recorder()
    render(
      <LayerSection
        name="Headline"
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

  it('writes data-name empty for an emptied name', async () => {
    const { changes, write } = recorder()
    render(
      <LayerSection
        name="Headline"
        opacity={1}
        radius={0}
        disabled={false}
        write={write}
      />,
    )

    await userEvent.clear(screen.getByRole('textbox', { name: 'Name' }))
    await userEvent.tab()

    expect(changes).toEqual([
      { kind: 'attribute', name: 'data-name', value: '' },
    ])
  })

  it('writes the radius in px', async () => {
    const { changes, write } = recorder()
    render(
      <LayerSection
        name="Headline"
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
      <LayerSection
        name="Headline"
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
      <LayerSection
        name="Headline"
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
  it('writes the size in px', async () => {
    const { changes, write } = recorder()
    render(
      <TypographySection
        fontSize={30}
        fontWeight={700}
        textAlign="left"
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
        fontSize={30}
        fontWeight={700}
        textAlign="left"
        disabled={false}
        write={write}
      />,
    )

    const field = screen.getByRole('textbox', { name: 'Font weight' })
    await userEvent.clear(field)
    await userEvent.type(field, '500{Enter}')

    expect(changes).toEqual([
      { kind: 'style', property: 'font-weight', value: '500' },
    ])
  })

  it('steps the weight by 100', async () => {
    const { changes, write } = recorder()
    render(
      <TypographySection
        fontSize={30}
        fontWeight={700}
        textAlign="left"
        disabled={false}
        write={write}
      />,
    )

    await userEvent.click(screen.getByRole('textbox', { name: 'Font weight' }))
    await userEvent.keyboard('{ArrowUp}')

    expect(changes).toEqual([
      { kind: 'style', property: 'font-weight', value: '800' },
    ])
  })

  it('writes the alignment a button names and lights the computed one', async () => {
    const { changes, write } = recorder()
    render(
      <TypographySection
        fontSize={30}
        fontWeight={700}
        textAlign="left"
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
})

describe('FillSection', () => {
  it.each([
    [true, ''],
    [false, 'transparent'],
  ])(
    'removes a background the element’s own style sets (%s) by writing %j',
    async (inline, written) => {
      const { changes, write } = recorder()
      render(
        <FillSection
          textOnly={false}
          color={null}
          backgroundColor={tokenValueOf('--primary')}
          tokens={[PRIMARY]}
          theme="light"
          inline={inline}
          disabled={false}
          write={write}
        />,
      )

      await userEvent.click(screen.getByRole('button', { name: 'Remove fill' }))

      expect(changes).toEqual([
        { kind: 'style', property: 'background-color', value: written },
      ])
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
  it('writes the text on Cmd+Enter', async () => {
    const { changes, write } = recorder()
    render(<TextSection text="Hello" disabled={false} write={write} />)

    const area = screen.getByRole('textbox', { name: 'Text' })
    await userEvent.clear(area)
    await userEvent.type(area, 'Welcome{Meta>}{Enter}{/Meta}')

    expect(changes).toEqual([{ kind: 'text', value: 'Welcome' }])
  })

  it('writes the text once on Enter and keeps nothing for the blur', async () => {
    const { changes, write } = recorder()
    render(<TextSection text="Hello" disabled={false} write={write} />)

    const area = screen.getByRole('textbox', { name: 'Text' })
    await userEvent.clear(area)
    await userEvent.type(area, 'Welcome{Enter}')
    await userEvent.tab()

    expect(changes).toEqual([{ kind: 'text', value: 'Welcome' }])
  })

  it('adds no line on Shift+Enter', async () => {
    const { changes, write } = recorder()
    render(<TextSection text="Hello" disabled={false} write={write} />)

    const area = screen.getByRole('textbox', { name: 'Text' })
    await userEvent.type(area, '{Shift>}{Enter}{/Shift}')

    expect(area).toHaveValue('Hello')
    expect(changes).toEqual([])
  })

  it('writes a pasted line break as a space', async () => {
    const { changes, write } = recorder()
    render(<TextSection text="Hello" disabled={false} write={write} />)

    const area = screen.getByRole('textbox', { name: 'Text' })
    await userEvent.clear(area)
    await userEvent.paste('Two\r\nlines')
    await userEvent.keyboard('{Enter}')

    expect(changes).toEqual([{ kind: 'text', value: 'Two lines' }])
  })

  it('hints the keys only while it has focus', async () => {
    const { write } = recorder()
    render(<TextSection text="Hello" disabled={false} write={write} />)

    expect(screen.queryByText('to apply', { exact: false })).toBeNull()
    await userEvent.click(screen.getByRole('textbox', { name: 'Text' }))

    expect(screen.getByText('to apply', { exact: false })).toBeVisible()
  })

  it('cancels on Esc and writes nothing', async () => {
    const { changes, write } = recorder()
    render(<TextSection text="Hello" disabled={false} write={write} />)

    const area = screen.getByRole('textbox', { name: 'Text' })
    await userEvent.type(area, ' there{Escape}')

    expect(changes).toEqual([])
    expect(area).toHaveValue('Hello')
  })

  it('shows the stored text again after a refused write', async () => {
    const { write } = recorder(false)
    render(<TextSection text="Hello" disabled={false} write={write} />)

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
      render(<TextSection text="Hello" disabled={false} write={write} />)
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
    render(<TextSection text="Hello" disabled={false} write={write} />)
    const area = screen.getByRole('textbox', { name: 'Text' })

    act(() => (area as HTMLTextAreaElement).focus())
    browserHistory(area as HTMLTextAreaElement, 'Hel')
    act(() => (area as HTMLTextAreaElement).blur())

    expect(changes).toEqual([{ kind: 'text', value: 'Hel' }])
  })
})

describe('LayerSection commit field', () => {
  it('drops a historyUndo while the field is unfocused', () => {
    const { changes, write } = recorder()
    render(
      <LayerSection
        name="Headline"
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

  it('raises the refusal and keeps the selection on a stale edit', async () => {
    const selection = createSelectionStore()
    selectElement(selection, 'studio/home', KEY)
    const told: { title: string; description: string }[] = []

    const written = await writeElement(
      'studio/home',
      KEY,
      { kind: 'text', value: 'Welcome' },
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
          'Hero.html changed after this edit was made, so nothing was written.',
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

    it('answers false with the stale toast when the agent wrote the frame meanwhile', async () => {
      const selection = createSelectionStore()
      selectElement(selection, 'studio/home', KEY)
      const told: { title: string; description: string }[] = []

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
            'Hero.html changed after this edit was made, so nothing was written.',
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
      'Element',
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
      border: true,
    })
  })

  it('leaves Typography out for an element holding no text', async () => {
    await mountFrame('<div></div>')

    renderWith(3)

    await screen.findByRole('heading', { name: 'Element' })
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
      await screen.findByRole('heading', { name: 'Element' })

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

    await screen.findByRole('heading', { name: 'Element' })
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

    await screen.findByRole('heading', { name: 'Element' })
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
