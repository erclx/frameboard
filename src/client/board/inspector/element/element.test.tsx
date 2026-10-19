import '../../../styles.css'

import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { TooltipProvider } from '@/client/components/ui/tooltip'
import { liveStore, receiveBoard } from '@/client/live/store'
import type { StyleValue } from '@/shared/records/elements'
import type { TokenRow } from '@/shared/records/tokens'
import { boardOf, frameOf, pageOf } from '@/test/board'

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
  it('writes color on an element holding text alone', async () => {
    const { changes, write } = recorder()
    render(
      <FillSection
        textOnly
        color={tokenValueOf('--primary')}
        backgroundColor={null}
        tokens={[PRIMARY, BORDER]}
        theme="light"
        disabled={false}
        write={write}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Fill token' }))
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'border' }),
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

  it('flags a raw value and names a token with its chip', () => {
    render(
      <>
        <FillSection
          textOnly
          color={{ value: '#111827', token: null, percent: 100 }}
          backgroundColor={null}
          tokens={[PRIMARY]}
          theme="light"
          disabled={false}
          write={recorder().write}
        />
        <StrokeSection
          bordered
          borderColor={tokenValueOf('--border')}
          tokens={[PRIMARY, BORDER]}
          theme="light"
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
  it('adds a 1px border in the border token', async () => {
    const { changes, write } = recorder()
    render(
      <StrokeSection
        bordered={false}
        borderColor={null}
        tokens={[PRIMARY, BORDER]}
        theme="light"
        disabled={false}
        write={write}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Add stroke' }))

    expect(changes).toEqual([
      { kind: 'style', property: 'border', value: '1px solid var(--border)' },
    ])
  })

  it('writes the border color through its row', async () => {
    const { changes, write } = recorder()
    render(
      <StrokeSection
        bordered
        borderColor={tokenValueOf('--border')}
        tokens={[PRIMARY, BORDER]}
        theme="light"
        disabled={false}
        write={write}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Stroke token' }))
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'primary' }),
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

  it('drops the declaration for None', async () => {
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
      { kind: 'style', property: 'box-shadow', value: '' },
    ])
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
