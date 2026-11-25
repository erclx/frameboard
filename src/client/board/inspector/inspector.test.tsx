import '../../styles.css'

import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { type Action, registerActions } from '@/client/actions/registry'
import { TooltipProvider } from '@/client/components/ui/tooltip'
import { liveStore, receiveBoard, receiveFindings } from '@/client/live/store'
import { createStructure } from '@/client/live/structure'
import { boardOf, frameOf, pageOf } from '@/test/board'
import { BRIDGE } from '@/test/frame-bridge'

import { trees } from '../element/tree'
import { modeStore } from '../mode'
import { clear, select, selectElement, selectionStore } from '../selection'
import { startFrameRename, stopFrameRename } from '../structure/actions'
import { presetStore } from '../structure/tool'
import { FrameSection } from './frame-section'
import { InspectorPanel } from './panel'
import { inspectorTabStore } from './tab-store'

const PAGE = 'studio/home'
const SWATCHES = frameOf('swatches', {
  name: 'Color swatches',
  box: { x: 460, y: 116, width: 640, height: 188 },
})
const SUNSET = frameOf('sunset', {
  box: { x: 460, y: 280, width: 640, height: 180 },
})

function renderPanel(open?: string) {
  return render(
    <TooltipProvider>
      <InspectorPanel open={open} />
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
      // A tree is held per reload of its frame, so one test's stub would name the next test's elements.
      trees.store.setState({ byRef: {} })
      modeStore.setState({ tool: 'move', mode: 'edit' })
      presetStore.setState({ preset: 'desktop' })
      inspectorTabStore.setState({ tab: 'design' })
      stopFrameRename()
    })
  })

  describe('under the Frame tool', () => {
    beforeEach(() => {
      modeStore.setState({ tool: 'frame', mode: 'edit' })
    })

    it('scrolls the presets in the panel’s body, never the panel with its header', () => {
      render(
        <TooltipProvider>
          <div style={{ height: 300 }}>
            <InspectorPanel />
          </div>
        </TooltipProvider>,
      )
      const panel = screen.getByRole('complementary', { name: 'Inspector' })

      screen.getAllByRole('radio').at(-1)?.scrollIntoView()

      expect(panel.scrollHeight).toBe(panel.clientHeight)
      expect(panel.scrollTop).toBe(0)
      expect(
        screen.getAllByRole('radio').at(-1)?.getBoundingClientRect().bottom,
      ).toBeLessThanOrEqual(panel.getBoundingClientRect().bottom)
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
      expect(
        within(screen.getByRole('radiogroup', { name: 'Slide' })).getByRole(
          'radio',
          { name: /Slide 4:3/ },
        ),
      ).toHaveTextContent('1024 × 768')
      expect(
        within(screen.getByRole('radiogroup', { name: 'Social' })).getByRole(
          'radio',
          { name: /Open Graph/ },
        ),
      ).toHaveTextContent('1200 × 630')
    })

    it('chooses a slide the next click places', async () => {
      renderPanel()

      await userEvent.click(screen.getByRole('radio', { name: /Slide 16:9/ }))

      expect(presetStore.getState().preset).toBe('slide-16-9')
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

      expect(screen.getAllByRole('radio')).toHaveLength(18)
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

  it('shows the open page’s Page section on Slides while nothing is selected', async () => {
    renderPanel(PAGE)

    await userEvent.click(screen.getByRole('tab', { name: 'Slides' }))

    expect(screen.getByRole('region', { name: 'Page' })).toBeInTheDocument()
  })

  it('keeps the Page section off Design', () => {
    renderPanel(PAGE)

    expect(screen.queryByRole('region', { name: 'Page' })).toBeNull()
  })

  describe('tabs', () => {
    const regions = () =>
      within(screen.getByRole('complementary', { name: 'Inspector' }))
        .queryAllByRole('region')
        .map((region) => region.getAttribute('aria-labelledby'))

    it('opens on Design', () => {
      act(() => select(selectionStore, PAGE, [SWATCHES.ref]))

      renderPanel()

      expect(screen.getByRole('tab', { name: 'Design' })).toHaveAttribute(
        'aria-selected',
        'true',
      )
    })

    it('holds the picked tab across a selection change', async () => {
      act(() => select(selectionStore, PAGE, [SWATCHES.ref]))
      renderPanel()
      await userEvent.click(screen.getByRole('tab', { name: 'Slides' }))

      act(() => select(selectionStore, PAGE, [SUNSET.ref]))

      expect(screen.getByRole('tab', { name: 'Slides' })).toHaveAttribute(
        'aria-selected',
        'true',
      )
      expect(screen.getByRole('region', { name: 'This slide' })).toBeVisible()
    })

    it('keeps the slide and export sections off one frame’s Design', () => {
      act(() => select(selectionStore, PAGE, [SWATCHES.ref]))

      renderPanel()

      expect(regions()).not.toContain('inspector-slide')
      expect(regions()).not.toContain('inspector-export')
      expect(screen.queryByRole('button', { name: /on a phone/ })).toBeNull()
    })

    it('draws This slide then Page on one frame’s Slides', async () => {
      act(() => select(selectionStore, PAGE, [SWATCHES.ref]))
      renderPanel()

      await userEvent.click(screen.getByRole('tab', { name: 'Slides' }))

      await waitFor(() =>
        expect(regions()).toEqual(['inspector-slide', 'inspector-page']),
      )
    })

    it('draws Export and Open on a phone on one frame’s Export', async () => {
      act(() => select(selectionStore, PAGE, [SWATCHES.ref]))
      renderPanel()

      await userEvent.click(screen.getByRole('tab', { name: 'Export' }))

      // Design's sections leave as its panel unmounts, a render after the press.
      await waitFor(() => expect(regions()).toEqual(['inspector-export']))
      expect(
        screen.getByRole('button', { name: /Open on a phone/ }),
      ).toBeInTheDocument()
    })

    it('says one frame exports at a time on several frames’ Export', async () => {
      act(() => select(selectionStore, PAGE, [SWATCHES.ref, SUNSET.ref]))
      renderPanel()

      await userEvent.click(screen.getByRole('tab', { name: 'Export' }))

      expect(
        screen.getByText('Select one frame or element to export it.'),
      ).toBeVisible()
      // Design's sections leave as its panel unmounts, a render after the press.
      await waitFor(() => expect(regions()).toEqual([]))
    })

    it('moves between tabs with the arrow keys', async () => {
      act(() => select(selectionStore, PAGE, [SWATCHES.ref]))
      renderPanel()
      act(() => screen.getByRole('tab', { name: 'Design' }).focus())

      await userEvent.keyboard('{ArrowRight}')

      expect(screen.getByRole('tab', { name: 'Slides' })).toHaveFocus()
    })

    it('says only to open a page on Slides with nothing selected and no page open', () => {
      inspectorTabStore.setState({ tab: 'slides' })

      renderPanel()

      expect(screen.getByRole('tabpanel')).toHaveTextContent(
        /^Open a page to set how its slides present\.$/,
      )
    })

    describe('slide hint', () => {
      const HINT = 'Select a slide to set its own transition and steps.'

      beforeEach(() => inspectorTabStore.setState({ tab: 'slides' }))

      it('asks for a slide above the open page’s section while nothing is selected', () => {
        renderPanel(PAGE)

        expect(
          screen
            .getByText(HINT)
            .compareDocumentPosition(
              screen.getByRole('region', { name: 'Page' }),
            ),
        ).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
      })

      it.each([
        ['one frame is', [SWATCHES.ref]],
        ['several frames are', [SWATCHES.ref, SUNSET.ref]],
      ])('leaves once %s selected', (_, refs) => {
        renderPanel(PAGE)
        expect(screen.getByText(HINT)).toBeVisible()

        act(() => select(selectionStore, PAGE, refs))

        expect(screen.queryByText(HINT)).toBeNull()
      })

      it('shows while the tab may not write', () => {
        liveStore.setState({ canWrite: false })

        renderPanel(PAGE)

        expect(screen.getByText(HINT)).toBeVisible()
      })
    })

    it('tabs from the strip into the tab’s first control, past the panel', async () => {
      act(() => select(selectionStore, PAGE, [SWATCHES.ref]))
      renderPanel()
      act(() => screen.getByRole('tab', { name: 'Export' }).focus())
      await userEvent.click(screen.getByRole('tab', { name: 'Export' }))
      // Design's controls sit ahead of Export's until its panel unmounts.
      await waitFor(() => expect(regions()).toEqual(['inspector-export']))

      await userEvent.tab()

      expect(screen.getByRole('button', { name: 'Export scale' })).toHaveFocus()
    })

    it('draws no tab strip under the Frame tool', () => {
      modeStore.setState({ tool: 'frame', mode: 'edit' })

      renderPanel()

      expect(screen.queryByRole('tablist')).toBeNull()
    })

    it('draws no tab strip in Play', () => {
      modeStore.setState({ tool: 'move', mode: 'play' })

      renderPanel()

      expect(screen.queryByRole('tablist')).toBeNull()
      expect(
        screen.getByText('Playing. Nothing selects in Play.'),
      ).toBeVisible()
    })
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

  describe('with the frames’ styles answered', () => {
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

      await screen.findByRole('heading', { name: 'Selection colors · 3' })
      const rows = await screen.findAllByRole('listitem')
      expect(rows.map((row) => row.textContent)).toEqual([
        'ABCDEF100%',
        '00ff00100%',
        'primary100%',
      ])
    })

    describe('with each color naming the elements using it', () => {
      const answered = { ...ANSWERS }
      const USED = {
        value: '#abcdef',
        token: null,
        percent: 100,
        uses: [3, 5],
      }

      beforeEach(() => {
        ANSWERS[SWATCHES.ref] = [USED]
        ANSWERS[SUNSET.ref] = [USED]
      })

      afterEach(() => {
        Object.assign(ANSWERS, answered)
      })

      it('selects them in the one selected frame, at the bytes the read answered', async () => {
        act(() => select(selectionStore, PAGE, [SWATCHES.ref]))
        renderPanel()

        await userEvent.click(
          await screen.findByRole('button', {
            name: 'Select 2 elements using abcdef',
          }),
        )

        expect(selectionStore.getState().elements).toEqual([
          { frame: SWATCHES.ref, index: 3, hash: BASE.hash },
          { frame: SWATCHES.ref, index: 5, hash: BASE.hash },
        ])
      })

      it('offers no Select across several frames, whose indices name different files', async () => {
        act(() => select(selectionStore, PAGE, [SWATCHES.ref, SUNSET.ref]))
        renderPanel()

        await screen.findByRole('button', { name: 'Copy #abcdef' })

        expect(screen.queryByRole('button', { name: /^Select / })).toBeNull()
      })
    })

    describe('with six colors on each frame', () => {
      const answered = { ...ANSWERS }
      const six = (start: number) =>
        [0, 1, 2, 3, 4, 5].map((n) => ({
          value: `#00000${start + n}`,
          token: null,
          percent: 100,
        }))

      beforeEach(() => {
        ANSWERS[SWATCHES.ref] = six(0)
        ANSWERS[SUNSET.ref] = six(1)
      })

      afterEach(() => {
        Object.assign(ANSWERS, answered)
      })

      it('caps the list again on a new selection after Show all', async () => {
        act(() => select(selectionStore, PAGE, [SWATCHES.ref]))
        renderPanel()
        await userEvent.click(
          await screen.findByRole('button', { name: 'Show all 6' }),
        )

        act(() => select(selectionStore, PAGE, [SUNSET.ref]))

        expect(
          await screen.findByRole('button', { name: 'Show all 6' }),
        ).toBeVisible()
      })
    })

    it('ends one frame’s Design on Selection colors', async () => {
      act(() => select(selectionStore, PAGE, [SWATCHES.ref]))

      renderPanel()

      await screen.findByRole('region', { name: /^Selection colors/ })
      const regions = within(
        screen.getByRole('complementary', { name: 'Inspector' }),
      )
        .getAllByRole('region')
        .map((region) => region.getAttribute('aria-labelledby'))
      expect(regions.at(-1)).toBe('inspector-selection-colors')
    })
  })

  it('runs an Arrange button’s registered action', async () => {
    let runs = 0
    const alignLeft: Action = {
      id: 'arrange.alignLeft',
      label: 'Align left',
      group: 'arrange',
      palette: false,
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

  describe('Checks', () => {
    afterEach(() => {
      act(() => receiveFindings(liveStore, { [SWATCHES.ref]: [] }))
    })

    it('draws no section for a frame with findings, which its label’s badge lists', () => {
      receiveFindings(liveStore, {
        [SWATCHES.ref]: [
          {
            rule: 'viewport',
            severity: 'warning',
            frame: SWATCHES.ref,
            path: 'studio/home/swatches.html',
            message: 'Grows with the viewport.',
            location: null,
          },
        ],
      })
      act(() => select(selectionStore, PAGE, [SWATCHES.ref]))

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
      iframe.srcdoc = `<!doctype html><html><head><style data-frameboard data-hash="${HASH}"></style>${BRIDGE}</head><body><h1>Swatches</h1></body></html>`
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

  describe('with a text element selected', () => {
    const HASH = 'd'.repeat(64)
    let layer: HTMLElement | undefined

    beforeEach(() => {
      vi.stubGlobal('fetch', async (input: RequestInfo | URL) =>
        String(input).includes('/styles')
          ? Response.json({
              ok: true,
              data: {
                ref: SWATCHES.ref,
                hash: HASH,
                element: null,
                colors: [],
              },
            })
          : Response.json({ ok: false }),
      )
    })

    afterEach(() => {
      vi.unstubAllGlobals()
      vi.restoreAllMocks()
      layer?.remove()
      layer = undefined
    })

    it('selects within the element, at the bytes the read answered', async () => {
      vi.stubGlobal('fetch', async (input: RequestInfo | URL) =>
        String(input).includes('/styles')
          ? Response.json({
              ok: true,
              data: {
                ref: SWATCHES.ref,
                hash: HASH,
                element: null,
                colors: [
                  { value: '#abcdef', token: null, percent: 100, uses: [3, 4] },
                ],
              },
            })
          : Response.json({ ok: false }),
      )
      layer = document.createElement('div')
      const frame = document.createElement('div')
      frame.dataset.frame = SWATCHES.ref
      const iframe = document.createElement('iframe')
      const loaded = new Promise((resolve) =>
        iframe.addEventListener('load', resolve, { once: true }),
      )
      iframe.srcdoc = `<!doctype html><html><head><style data-frameboard data-hash="${HASH}"></style>${BRIDGE}</head><body><h1>Swatches<b>x</b></h1></body></html>`
      frame.append(iframe)
      layer.append(frame)
      document.body.append(layer)
      await loaded
      act(() =>
        selectElement(selectionStore, PAGE, {
          frame: SWATCHES.ref,
          index: 3,
          hash: HASH,
        }),
      )
      renderPanel()

      await userEvent.click(
        await screen.findByRole('button', {
          name: 'Select 2 elements using abcdef',
        }),
      )

      expect(selectionStore.getState().elements).toEqual([
        { frame: SWATCHES.ref, index: 3, hash: HASH },
        { frame: SWATCHES.ref, index: 4, hash: HASH },
      ])
    })

    it('raises no duplicate key among its sections', async () => {
      layer = document.createElement('div')
      const frame = document.createElement('div')
      frame.dataset.frame = SWATCHES.ref
      const iframe = document.createElement('iframe')
      const loaded = new Promise((resolve) =>
        iframe.addEventListener('load', resolve, { once: true }),
      )
      iframe.srcdoc = `<!doctype html><html><head><style data-frameboard data-hash="${HASH}"></style>${BRIDGE}</head><body><h1>Swatches</h1></body></html>`
      frame.append(iframe)
      layer.append(frame)
      document.body.append(layer)
      await loaded
      const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
      // The file counts html, head, and body ahead of the h1.
      act(() =>
        selectElement(selectionStore, PAGE, {
          frame: SWATCHES.ref,
          index: 3,
          hash: HASH,
        }),
      )

      renderPanel()

      expect(
        await screen.findByRole('region', { name: 'Text' }),
      ).toBeInTheDocument()
      const duplicates = logged.mock.calls.filter(([message]) =>
        String(message).includes('same key'),
      )
      expect(duplicates).toEqual([])
    })
  })

  it('disables the fields while the tab may not write', () => {
    liveStore.setState({ canWrite: false })
    act(() => select(selectionStore, PAGE, [SWATCHES.ref]))

    renderPanel()

    expect(screen.getByRole('textbox', { name: 'Width' })).toBeDisabled()
  })
})
