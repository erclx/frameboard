import '../../styles.css'

import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { type Action, registerActions } from '@/client/actions/registry'
import { TooltipProvider } from '@/client/components/ui/tooltip'
import { liveStore, receiveBoard, receiveFindings } from '@/client/live/store'
import { createStructure } from '@/client/live/structure'
import { boardOf, frameOf, pageOf } from '@/test/board'

import type { Box } from '../geometry/box'
import { modeStore } from '../mode'
import { endPreview, previewOf, setPreview } from '../preview/store'
import { clear, select, selectionStore } from '../selection'
import { startFrameRename, stopFrameRename } from '../structure/actions'
import { presetStore } from '../structure/tool'
import { FrameSection } from './frame-section'
import { InspectorPanel } from './panel'

const PAGE = 'studio/home'
const SWATCHES = frameOf('swatches', {
  name: 'Color swatches',
  box: { x: 460, y: 116, width: 640, height: 188 },
})
const SUNSET = frameOf('sunset', {
  box: { x: 460, y: 280, width: 640, height: 180 },
})

function renderPanel() {
  return render(
    <TooltipProvider>
      <InspectorPanel />
    </TooltipProvider>,
  )
}

/** What a field reads, its value or the `Mixed` it shows where frames differ. */
function value(label: string): string {
  const field = screen.getByRole('textbox', { name: label }) as HTMLInputElement
  return field.value || field.placeholder
}

describe('InspectorPanel', () => {
  beforeEach(() => {
    receiveBoard(liveStore, boardOf(pageOf([SWATCHES, SUNSET])))
    liveStore.setState({ canWrite: true })
  })

  afterEach(() => {
    act(() => {
      clear(selectionStore)
      modeStore.setState({ tool: 'move', mode: 'edit' })
      presetStore.setState({ preset: 'desktop' })
      stopFrameRename()
    })
  })

  describe('under the Frame tool', () => {
    beforeEach(() => {
      modeStore.setState({ tool: 'frame', mode: 'edit' })
    })

    it('lists the presets with desktop chosen', () => {
      renderPanel()

      expect(screen.getByRole('radio', { name: /Desktop/ })).toHaveAttribute(
        'aria-checked',
        'true',
      )
      expect(screen.getByRole('radio', { name: /Tablet/ })).toHaveTextContent(
        '834 × 1194',
      )
    })

    it('chooses the preset the next click places', async () => {
      renderPanel()

      await userEvent.click(screen.getByRole('radio', { name: /^Phone/ }))

      expect(presetStore.getState().preset).toBe('phone')
      expect(screen.getByRole('radio', { name: /^Phone/ })).toHaveAttribute(
        'aria-checked',
        'true',
      )
    })

    it('lists each device under its group', () => {
      renderPanel()

      expect(
        within(screen.getByRole('radiogroup', { name: 'Phone' })).getByRole(
          'radio',
          { name: /iPhone 16 Pro Max/ },
        ),
      ).toHaveTextContent('440 × 956')
      expect(
        within(screen.getByRole('radiogroup', { name: 'Tablet' })).getByRole(
          'radio',
          { name: /iPad mini/ },
        ),
      ).toHaveTextContent('744 × 1133')
      expect(
        within(screen.getByRole('radiogroup', { name: 'Desktop' })).getByRole(
          'radio',
          { name: /Full HD/ },
        ),
      ).toHaveTextContent('1920 × 1080')
    })

    it('chooses a device the next click places', async () => {
      renderPanel()

      await userEvent.click(
        screen.getByRole('radio', { name: /^iPhone 16\s*393/ }),
      )

      expect(presetStore.getState().preset).toBe('iphone-16')
      expect(screen.getByRole('radio', { name: /Desktop/ })).toHaveAttribute(
        'aria-checked',
        'false',
      )
    })

    it('shows the sizes over a selected frame', () => {
      act(() => select(selectionStore, PAGE, [SWATCHES.ref]))

      renderPanel()

      expect(screen.getAllByRole('radio')).toHaveLength(11)
      expect(screen.queryByRole('textbox', { name: 'Width' })).toBeNull()
    })
  })

  it('opens on one View only line in a tab the server says reads', () => {
    act(() =>
      liveStore.setState({
        connected: true,
        accessKnown: true,
        canWrite: false,
      }),
    )

    renderPanel()

    expect(
      screen.getByText('View only. Run frameboard open to edit'),
    ).toBeVisible()
    act(() => liveStore.setState({ connected: false, accessKnown: false }))
  })

  it('carries no View only line in a tab that writes', () => {
    act(() => liveStore.setState({ connected: true, accessKnown: true }))

    renderPanel()

    expect(screen.queryByText(/View only/)).toBeNull()
    act(() => liveStore.setState({ connected: false, accessKnown: false }))
  })

  it('holds the hint while nothing is selected', () => {
    renderPanel()

    expect(
      screen.getByText('Select a frame to see its details.'),
    ).toBeInTheDocument()
  })

  it('shows one frame’s name and box', () => {
    act(() => select(selectionStore, PAGE, [SWATCHES.ref]))

    renderPanel()

    expect(screen.getByRole('heading', { name: 'Frame' })).toBeInTheDocument()
    expect(screen.getByText('Color swatches')).toBeInTheDocument()
    expect(['X position', 'Y position', 'Width', 'Height'].map(value)).toEqual([
      '460',
      '116',
      '640',
      '188',
    ])
    expect(screen.queryByRole('heading', { name: 'Arrange' })).toBeNull()
  })

  it('renames the frame from its name', async () => {
    const sent: unknown[] = []
    const calls = createStructure(async (_path, init) => {
      sent.push(JSON.parse(String(init?.body)))
      return Response.json({
        ok: true,
        data: { ...SWATCHES, ref: 'studio/home/palette', name: 'palette' },
      })
    })
    act(() => select(selectionStore, PAGE, [SWATCHES.ref]))
    render(<FrameSection page={PAGE} frames={[SWATCHES]} calls={calls} />)

    await userEvent.click(
      screen.getByRole('button', { name: 'Rename frame Color swatches' }),
    )
    await userEvent.keyboard('palette{Enter}')

    expect(sent).toEqual([{ ref: SWATCHES.ref, name: 'palette' }])
  })

  it('opens the name field when the palette asks to rename the frame', () => {
    act(() => select(selectionStore, PAGE, [SWATCHES.ref]))
    renderPanel()

    act(() => startFrameRename(SWATCHES.ref, 'inspector'))

    expect(
      screen.getByRole('textbox', { name: 'Rename frame Color swatches' }),
    ).toHaveFocus()
  })

  it('reads Mixed where several frames differ, and adds Arrange', () => {
    act(() => select(selectionStore, PAGE, [SWATCHES.ref, SUNSET.ref]))

    renderPanel()

    expect(
      screen.getByRole('heading', { name: '2 frames' }),
    ).toBeInTheDocument()
    expect(['X position', 'Y position', 'Width', 'Height'].map(value)).toEqual([
      '460',
      'Mixed',
      '640',
      'Mixed',
    ])
    expect(screen.getByRole('heading', { name: 'Arrange' })).toBeInTheDocument()
  })

  describe('with several frames’ styles answered', () => {
    const BASE = { element: null, hash: 'a'.repeat(64) }
    const ANSWERS: Record<string, unknown[]> = {
      [SWATCHES.ref]: [
        { value: 'var(--primary)', token: '--primary', percent: 100 },
        { value: '#ABCDEF', token: null, percent: 100 },
      ],
      [SUNSET.ref]: [
        { value: 'var(--primary)', token: '--primary', percent: 100 },
        { value: '#abcdef', token: null, percent: 100 },
        { value: '#00ff00', token: null, percent: 100 },
      ],
    }

    beforeEach(() => {
      vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
        const url = new URL(String(input), location.href)
        const ref = url.searchParams.get('ref') ?? ''
        if (!url.pathname.endsWith('/styles')) {
          return Response.json({ ok: false })
        }
        return Response.json({
          ok: true,
          data: { ...BASE, ref, colors: ANSWERS[ref] ?? [] },
        })
      })
    })

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('lists a color both frames use once, whatever its case, and keeps the others', async () => {
      act(() => select(selectionStore, PAGE, [SWATCHES.ref, SUNSET.ref]))

      renderPanel()

      await screen.findByRole('heading', { name: 'Selection colors' })
      const rows = await screen.findAllByRole('listitem')
      expect(rows.map((row) => row.textContent)).toEqual([
        'primary100%',
        'ABCDEF100%',
        '00ff00100%',
      ])
    })
  })

  it('runs an Arrange button’s registered action', async () => {
    let runs = 0
    const alignLeft: Action = {
      id: 'arrange.alignLeft',
      label: 'Align left',
      group: 'arrange',
      keys: ['Alt+KeyA'],
      run: () => {
        runs += 1
      },
    }
    const unregister = registerActions([alignLeft])
    act(() => select(selectionStore, PAGE, [SWATCHES.ref, SUNSET.ref]))
    renderPanel()

    await userEvent.click(screen.getByRole('button', { name: 'Align left' }))

    expect(runs).toBe(1)
    unregister()
  })

  it('runs Fit height from the one frame’s H field', async () => {
    let runs = 0
    const fitHeight: Action = {
      id: 'frame.fitHeight',
      label: 'Fit height',
      group: 'frame',
      run: () => {
        runs += 1
      },
    }
    const unregister = registerActions([fitHeight])
    act(() => select(selectionStore, PAGE, [SWATCHES.ref]))
    renderPanel()

    await userEvent.click(screen.getByRole('button', { name: 'Fit height' }))

    expect(runs).toBe(1)
    unregister()
  })

  it('leaves Fit height out for several frames', () => {
    const unregister = registerActions([
      {
        id: 'frame.fitHeight',
        label: 'Fit height',
        group: 'frame',
        run: () => {},
      },
    ])
    act(() => select(selectionStore, PAGE, [SWATCHES.ref, SUNSET.ref]))

    renderPanel()

    expect(screen.queryByRole('button', { name: 'Fit height' })).toBeNull()
    unregister()
  })

  describe('Checks', () => {
    afterEach(() => {
      act(() => receiveFindings(liveStore, { [SWATCHES.ref]: [] }))
    })

    const finding = {
      rule: 'viewport',
      severity: 'warning',
      frame: SWATCHES.ref,
      path: 'studio/home/swatches.html',
      message: 'Grows with the viewport.',
      location: null,
    } as const

    it('lists one selected frame’s findings', () => {
      receiveFindings(liveStore, { [SWATCHES.ref]: [finding] })
      act(() => select(selectionStore, PAGE, [SWATCHES.ref]))

      renderPanel()

      const section = screen.getByRole('region', { name: 'Checks · 1' })
      expect(section).toHaveTextContent('viewportGrows with the viewport.')
    })

    it('draws no section for a frame with no findings', () => {
      act(() => select(selectionStore, PAGE, [SWATCHES.ref]))

      renderPanel()

      expect(screen.queryByRole('region', { name: /Checks/ })).toBeNull()
    })

    it('draws no section for several frames', () => {
      receiveFindings(liveStore, { [SWATCHES.ref]: [finding] })
      act(() => select(selectionStore, PAGE, [SWATCHES.ref, SUNSET.ref]))

      renderPanel()

      expect(screen.queryByRole('region', { name: /Checks/ })).toBeNull()
    })
  })

  describe('Fill', () => {
    const HASH = 'b'.repeat(64)
    const PRIMARY = {
      name: '--primary',
      group: 'color',
      light: '#4f46e5',
      dark: '#818cf8',
      sheet: 'tokens.css',
    }
    let layer: HTMLElement | undefined
    let edits: unknown[] = []

    /** Mounts the swatches frame's live iframe, whose `body` sits at index 2. */
    async function mountSwatches(): Promise<void> {
      layer = document.createElement('div')
      const frame = document.createElement('div')
      frame.dataset.frame = SWATCHES.ref
      const iframe = document.createElement('iframe')
      const loaded = new Promise((resolve) =>
        iframe.addEventListener('load', resolve, { once: true }),
      )
      iframe.srcdoc = `<!doctype html><html><head><style data-frameboard data-hash="${HASH}"></style></head><body><h1>Swatches</h1></body></html>`
      frame.append(iframe)
      layer.append(frame)
      document.body.append(layer)
      await loaded
    }

    beforeEach(() => {
      edits = []
      vi.stubGlobal(
        'fetch',
        async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = String(input)
          if (url.includes('/tokens')) {
            return Response.json({
              ok: true,
              data: { sheets: [], tokens: [PRIMARY] },
            })
          }
          if (url.includes('/edit')) {
            edits.push(JSON.parse(String(init?.body)))
            return Response.json({
              ok: true,
              data: { ref: SWATCHES.ref, index: 2, hash: 'c'.repeat(64) },
            })
          }
          return Response.json({
            ok: true,
            data: {
              ref: SWATCHES.ref,
              hash: HASH,
              element: {
                color: null,
                backgroundColor: null,
                borderColor: null,
                borderWidth: null,
                boxShadow: null,
                fontFamily: null,
              },
              colors: [],
            },
          })
        },
      )
    })

    afterEach(() => {
      vi.unstubAllGlobals()
      layer?.remove()
      layer = undefined
    })

    it('adds the first color token to one frame’s body', async () => {
      await mountSwatches()
      act(() => select(selectionStore, PAGE, [SWATCHES.ref]))
      renderPanel()

      const add = await screen.findByRole('button', { name: 'Add fill' })
      await waitFor(() => expect(add).toBeEnabled())
      await userEvent.click(add)

      await waitFor(() =>
        expect(edits).toEqual([
          {
            ref: SWATCHES.ref,
            index: 2,
            hash: HASH,
            change: {
              kind: 'style',
              property: 'background-color',
              value: 'var(--primary)',
            },
          },
        ]),
      )
    })

    it('shows the Fill once a frame selected as a placeholder mounts its page', async () => {
      act(() => select(selectionStore, PAGE, [SWATCHES.ref]))
      renderPanel()
      await screen.findByRole('button', { name: /Rename frame/ })
      expect(screen.queryByRole('heading', { name: 'Fill' })).toBeNull()

      await mountSwatches()

      expect(await screen.findByRole('heading', { name: 'Fill' })).toBeVisible()
    })

    it('draws no Fill for several frames', async () => {
      await mountSwatches()
      act(() => select(selectionStore, PAGE, [SWATCHES.ref, SUNSET.ref]))

      renderPanel()

      await screen.findByRole('heading', { name: '2 frames' })
      expect(screen.queryByRole('heading', { name: 'Fill' })).toBeNull()
    })
  })

  it('disables the fields while the tab may not write', () => {
    liveStore.setState({ canWrite: false })
    act(() => select(selectionStore, PAGE, [SWATCHES.ref]))

    renderPanel()

    expect(screen.getByRole('textbox', { name: 'Width' })).toBeDisabled()
  })
})

describe('FrameSection', () => {
  function renderSection(frames = [SWATCHES]) {
    const writes: { boxes: Readonly<Record<string, Box>> }[] = []
    render(
      <FrameSection
        page={PAGE}
        frames={frames}
        write={async (_page, boxes) => {
          writes.push({ boxes })
          return true
        }}
      />,
    )
    return writes
  }

  beforeEach(() => {
    liveStore.setState({ canWrite: true })
  })

  it('writes the typed value on Enter', async () => {
    const writes = renderSection()

    await userEvent.type(
      screen.getByRole('textbox', { name: 'X position' }),
      '500{Enter}',
    )

    expect(writes).toEqual([
      { boxes: { [SWATCHES.ref]: { ...SWATCHES.box, x: 500 } } },
    ])
  })

  it('sets one value on every selected frame on blur', async () => {
    const writes = renderSection([SWATCHES, SUNSET])

    await userEvent.type(screen.getByRole('textbox', { name: 'Height' }), '200')
    await userEvent.tab()

    expect(writes).toEqual([
      {
        boxes: {
          [SWATCHES.ref]: { ...SWATCHES.box, height: 200 },
          [SUNSET.ref]: { ...SUNSET.box, height: 200 },
        },
      },
    ])
  })

  it('writes nothing for a value that is not a whole number', async () => {
    const writes = renderSection()

    await userEvent.type(
      screen.getByRole('textbox', { name: 'Width' }),
      'wide{Enter}',
    )

    expect(writes).toEqual([])
    expect(value('Width')).toBe('640')
  })

  it('steps a value on ArrowUp, by ten with Shift', async () => {
    const writes = renderSection()

    await userEvent.click(screen.getByRole('textbox', { name: 'X position' }))
    await userEvent.keyboard('{ArrowUp}{Shift>}{ArrowUp}{/Shift}')

    expect(writes).toEqual([
      { boxes: { [SWATCHES.ref]: { ...SWATCHES.box, x: 461 } } },
      { boxes: { [SWATCHES.ref]: { ...SWATCHES.box, x: 471 } } },
    ])
  })

  it('moves each frame by a step on a Mixed value, keeping their offsets', async () => {
    const writes = renderSection([SWATCHES, SUNSET])

    await userEvent.click(screen.getByRole('textbox', { name: 'Y position' }))
    await userEvent.keyboard('{ArrowUp>3/}')

    expect(writes).toEqual([
      {
        boxes: {
          [SWATCHES.ref]: { ...SWATCHES.box, y: 119 },
          [SUNSET.ref]: { ...SUNSET.box, y: 283 },
        },
      },
    ])
  })

  it('keeps a width at 1 px or more', async () => {
    const writes = renderSection()

    await userEvent.type(
      screen.getByRole('textbox', { name: 'Width' }),
      '0{Enter}',
    )

    expect(writes[0]?.boxes[SWATCHES.ref]?.width).toBe(1)
  })

  describe('Preview row', () => {
    afterEach(() => {
      act(() => endPreview([SWATCHES.ref, SUNSET.ref]))
    })

    function renderRow(frames = [SWATCHES]) {
      return renderSection(frames)
    }

    it('previews the frame at a preset width and writes nothing', async () => {
      const writes = renderRow()

      await userEvent.click(
        screen.getByRole('button', { name: 'Preview at phone width, 390' }),
      )

      expect(previewOf(SWATCHES.ref)).toEqual({ width: 390 })
      expect(
        screen.getByRole('button', { name: 'Preview at phone width, 390' }),
      ).toHaveAttribute('aria-pressed', 'true')
      expect(writes).toEqual([])
    })

    it('previews every selected frame at once', async () => {
      renderRow([SWATCHES, SUNSET])

      await userEvent.click(
        screen.getByRole('button', { name: 'Preview at tablet width, 834' }),
      )

      expect([previewOf(SWATCHES.ref), previewOf(SUNSET.ref)]).toEqual([
        { width: 834 },
        { width: 834 },
      ])
    })

    it('leaves the Width field at the stored width under a preview', async () => {
      renderRow()

      await userEvent.click(
        screen.getByRole('button', { name: 'Preview at phone width, 390' }),
      )

      expect(value('Width')).toBe('640')
      expect(value('Preview width')).toBe('390')
    })

    it('previews a typed width', async () => {
      const writes = renderRow()

      await userEvent.type(
        screen.getByRole('textbox', { name: 'Preview width' }),
        '500{Enter}',
      )

      expect(previewOf(SWATCHES.ref)).toEqual({ width: 500 })
      expect(writes).toEqual([])
    })

    it('scrubs the width from the stored one, previewing as it drags', () => {
      const writes = renderRow()
      const input = screen.getByRole('textbox', { name: 'Preview width' })
      const area =
        input.parentElement?.querySelector<HTMLElement>('.cursor-ew-resize')
      if (!area) throw new Error('no scrub area')

      scrubBy(area, 3)

      expect(previewOf(SWATCHES.ref)?.width).toBeGreaterThan(640)
      expect(writes).toEqual([])
    })

    it('steps each frame from its own previewed width on a Mixed value', async () => {
      act(() => {
        setPreview([SWATCHES.ref], 390)
        setPreview([SUNSET.ref], 834)
      })
      renderRow([SWATCHES, SUNSET])

      await userEvent.click(
        screen.getByRole('textbox', { name: 'Preview width' }),
      )
      await userEvent.keyboard('{ArrowUp>3/}')

      expect([previewOf(SWATCHES.ref), previewOf(SUNSET.ref)]).toEqual([
        { width: 393 },
        { width: 837 },
      ])
    })

    it('ends the preview', async () => {
      act(() => setPreview([SWATCHES.ref], 390))
      renderRow()

      await userEvent.click(screen.getByRole('button', { name: 'End preview' }))

      expect(previewOf(SWATCHES.ref)).toBeUndefined()
      expect(
        screen.queryByRole('button', { name: 'End preview' }),
      ).not.toBeInTheDocument()
    })
  })
})

/** Drags a scrub area right by `moves` of base-ui's two pixel steps and releases it. */
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
