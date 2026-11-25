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
import { liveStore, receiveBoard } from '@/client/live/store'
import type { FontList } from '@/shared/records/sourcing'
import type { TokenRow } from '@/shared/records/tokens'
import { boardOf, frameOf, pageOf } from '@/test/board'
import { BRIDGE } from '@/test/frame-bridge'

import { shownHashOf } from '../../bridge/shown'
import {
  clear,
  selectElement,
  selectElements,
  selectionStore,
} from '../../selection'
import { InspectorPanel } from '../panel'
import { SelectionColors } from '../selection-colors'
import { PRIMARY, SHADOW, tokenValueOf } from './fixtures'
import { ARRANGE_FREE_ONLY } from './several'
import { previewStyle, useLiveElement } from './styles'

describe('SelectionColors', () => {
  it('lists each color with its chip or raw hex and no raw flag', () => {
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
      screen.queryByRole('img', { name: 'Raw value, not a token' }),
    ).toBeNull()
  })
})

describe('InspectorPanel with several elements selected', () => {
  const HASH = 'c'.repeat(64)
  const HERO = frameOf('hero', {
    box: { x: 0, y: 0, width: 400, height: 300 },
  })
  let layer: HTMLDivElement | undefined
  const sent: unknown[] = []

  // Past the skipped injected style: html 0, head 1, body 2, then h1 3, div 4, div 5.
  const BODY =
    '<h1 style="opacity:0.5;border-radius:4px">Title</h1><div style="opacity:0.5;border-radius:8px;width:20px;height:20px"></div><div style="opacity:0.5;width:30px;height:20px"></div>'

  async function mountAndSelect(indexes: readonly number[], using?: string) {
    layer = document.createElement('div')
    const frame = document.createElement('div')
    frame.dataset.frame = HERO.ref
    const iframe = document.createElement('iframe')
    const loaded = new Promise((resolve) =>
      iframe.addEventListener('load', resolve, { once: true }),
    )
    iframe.srcdoc = `<!doctype html><html><head><style data-frameboard data-hash="${HASH}"></style>${BRIDGE}</head><body>${BODY}</body></html>`
    frame.append(iframe)
    layer.append(frame)
    document.body.append(layer)
    await loaded
    act(() =>
      selectElements(
        selectionStore,
        'studio/home',
        indexes.map((index) => ({ frame: HERO.ref, index, hash: HASH })),
        using,
      ),
    )
    render(
      <TooltipProvider>
        <InspectorPanel />
      </TooltipProvider>,
    )
    await screen.findByRole('region', { name: 'Position' })
  }

  const headings = () =>
    screen.getAllByRole('heading').map((heading) => heading.textContent)

  /** Lora installed in the project, which the Typography part's family picker lists. */
  const INSTALLED: FontList = {
    version: 1,
    project: 'studio',
    fonts: [
      {
        id: 'lora',
        family: 'Lora',
        category: 'serif',
        license: 'OFL-1.1',
        licenseUrl: 'https://example.test/lora/license',
        landingUrl: 'https://fontsource.org/fonts/lora',
        variable: true,
        weights: [{ min: 400, max: 700 }],
        styles: ['normal'],
        path: 'fonts/lora',
        files: 2,
        bundled: false,
        frames: [],
      },
    ],
  }

  beforeEach(() => {
    sent.length = 0
    receiveBoard(liveStore, boardOf(pageOf([HERO])))
    liveStore.setState({ canWrite: true })
    vi.stubGlobal(
      'fetch',
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        if (url.includes('/styles')) {
          return Response.json({
            ok: true,
            data: {
              ref: HERO.ref,
              hash: HASH,
              colors: url.includes('index=3')
                ? [{ value: '#111111', token: null, percent: 100, uses: [3] }]
                : [
                    {
                      value: '#222222',
                      token: null,
                      percent: 100,
                      uses: [url.includes('index=4') ? 4 : 5],
                    },
                  ],
              element: url.includes('index=3')
                ? {
                    color: { value: '#111111', token: null, percent: 100 },
                    backgroundColor: null,
                    borderColor: null,
                    boxShadow: null,
                  }
                : url.includes('index=4')
                  ? {
                      color: null,
                      backgroundColor: {
                        value: '#222222',
                        token: null,
                        percent: 100,
                      },
                      borderColor: null,
                      boxShadow: null,
                    }
                  : null,
            },
          })
        }
        if (url.includes('/fonts/installed')) {
          return Response.json({ ok: true, data: INSTALLED })
        }
        if (url.includes('/api/frames/edit')) {
          sent.push(JSON.parse(String(init?.body)))
          return Response.json({
            ok: true,
            data: {
              ref: HERO.ref,
              index: 5,
              indexes: [],
              hash: 'd'.repeat(64),
              from: HASH,
            },
          })
        }
        return Response.json({ ok: false })
      },
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    act(() => clear(selectionStore))
    layer?.remove()
    layer = undefined
  })

  it('heads the panel with the count and the frame, over every section any member has', async () => {
    await mountAndSelect([3, 4, 5])

    expect(headings().slice(0, 6)).toEqual([
      '3 elements',
      'Position',
      'Arrange',
      'Layout',
      'Appearance',
      'Typography · 1 of 3',
    ])
    expect(screen.getByText('in hero')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Frame' })).toBeNull()
    expect(screen.queryByText(/using/)).toBeNull()
  })

  it('lists the project’s installed families in the Typography part’s family picker', async () => {
    await mountAndSelect([3, 4, 5])

    await userEvent.click(
      within(screen.getByRole('region', { name: /^Typography/ })).getByRole(
        'button',
        { name: 'Font family' },
      ),
    )

    expect(
      await screen.findByRole('menuitemradio', { name: 'Lora' }),
    ).toBeInTheDocument()
  })

  it('says why Arrange waits while an element sits in the flow', async () => {
    await mountAndSelect([4, 5])

    expect(
      within(screen.getByRole('region', { name: 'Arrange' })).getByText(
        ARRANGE_FREE_ONLY,
      ),
    ).toBeVisible()
  })

  it('names the color the elements were selected through', async () => {
    await mountAndSelect([4, 5], '222222')

    expect(screen.getByRole('heading', { name: '2 elements' })).toBeVisible()
    expect(screen.getByText('· using 222222')).toBeVisible()
    expect(screen.getByText('in hero')).toBeVisible()
  })

  it('narrows to the elements a merged color names, across every member', async () => {
    await mountAndSelect([3, 4, 5])

    await userEvent.click(
      await screen.findByRole('button', {
        name: 'Select 2 elements using 222222',
      }),
    )

    expect(selectionStore.getState().elements).toEqual([
      { frame: HERO.ref, index: 4, hash: HASH },
      { frame: HERO.ref, index: 5, hash: HASH },
    ])
    expect(await screen.findByText('· using 222222')).toBeVisible()
  })

  it('shows a shared value, and Mixed where they differ', async () => {
    await mountAndSelect([3, 4, 5])

    expect(screen.getByRole('textbox', { name: 'Opacity' })).toHaveValue('50%')
    const radius = screen.getByRole('textbox', { name: 'Corner radius' })
    expect(radius).toHaveValue('')
    expect(radius).toHaveAttribute('placeholder', 'Mixed')
  })

  it('leaves Typography out when no member holds text', async () => {
    await mountAndSelect([4, 5])

    expect(headings()).not.toContain('Typography')
  })

  it('counts the members holding a fill, once their styles answer', async () => {
    await mountAndSelect([3, 4, 5])

    await waitFor(() => expect(headings()).toContain('Fill · 2 of 3'))
    expect(
      screen.getByRole('button', { name: 'Fill token' }),
    ).toHaveTextContent('Mixed')
  })

  it('merges the members’ colors in Selection colors', async () => {
    await mountAndSelect([3, 4, 5])

    expect(await screen.findByText('111111')).toBeInTheDocument()
    expect(screen.getByText('222222')).toBeInTheDocument()
  })

  it('sends a typed value to every member as one edit', async () => {
    await mountAndSelect([3, 4])
    const user = userEvent.setup()

    await user.click(screen.getByRole('textbox', { name: 'Opacity' }))
    await user.keyboard('25{Enter}')

    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]).toEqual({
      ref: HERO.ref,
      hash: HASH,
      edits: [3, 4].map((index) => ({
        index,
        change: { kind: 'style', property: 'opacity', value: '0.25' },
      })),
    })
  })

  it('moves each member by a step from its own on a Mixed field', async () => {
    await mountAndSelect([3, 4])
    const user = userEvent.setup()

    await user.click(screen.getByRole('textbox', { name: 'Corner radius' }))
    await user.keyboard('{ArrowUp}')

    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]).toMatchObject({
      edits: [
        { index: 3, change: { property: 'border-radius', value: '5px' } },
        { index: 4, change: { property: 'border-radius', value: '9px' } },
      ],
    })
  })

  it('writes Typography on the members holding text alone', async () => {
    await mountAndSelect([3, 4, 5])
    const user = userEvent.setup()

    await user.click(screen.getByRole('textbox', { name: 'Font size' }))
    await user.keyboard('18{Enter}')

    await waitFor(() => expect(sent).toHaveLength(1))
    expect(sent[0]).toMatchObject({
      edits: [{ index: 3, change: { property: 'font-size', value: '18px' } }],
    })
  })

  it('disables the fields while the tab may not write', async () => {
    liveStore.setState({ canWrite: false })

    await mountAndSelect([3, 4])

    expect(screen.getByRole('textbox', { name: 'Opacity' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Absolute' })).toBeDisabled()
  })
})

describe('InspectorPanel with a video selected', () => {
  const HASH = 'e'.repeat(64)
  const WRITTEN = 'f'.repeat(64)
  const CLIP = frameOf('clip', {
    box: { x: 0, y: 0, width: 400, height: 300 },
  })
  let layer: HTMLDivElement | undefined

  beforeEach(() => {
    receiveBoard(liveStore, boardOf(pageOf([CLIP])))
    liveStore.setState({ canWrite: true })
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      if (String(input).includes('/api/frames/edit')) {
        return Response.json({
          ok: true,
          data: { ref: CLIP.ref, index: 3, indexes: [], hash: WRITTEN },
        })
      }
      return Response.json({ ok: false })
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    act(() => clear(selectionStore))
    layer?.remove()
    layer = undefined
  })

  it('adopts a file switch write on the live page rather than reloading it', async () => {
    layer = document.createElement('div')
    const frame = document.createElement('div')
    frame.dataset.frame = CLIP.ref
    const iframe = document.createElement('iframe')
    const loaded = new Promise((resolve) =>
      iframe.addEventListener('load', resolve, { once: true }),
    )
    // Past the skipped injected style: html 0, head 1, body 2, then the video 3.
    iframe.srcdoc = `<!doctype html><html><head><style data-frameboard data-hash="${HASH}"></style>${BRIDGE}</head><body><video></video></body></html>`
    frame.append(iframe)
    layer.append(frame)
    document.body.append(layer)
    await loaded
    act(() =>
      selectElement(selectionStore, 'studio/home', {
        frame: CLIP.ref,
        index: 3,
        hash: HASH,
      }),
    )
    render(
      <TooltipProvider>
        <InspectorPanel />
      </TooltipProvider>,
    )

    await userEvent.click(await screen.findByRole('switch', { name: 'Loop' }))

    // A write that waits on a reload leaves the page held at the bytes it was sent from.
    await waitFor(() => expect(shownHashOf(iframe)).toBe(WRITTEN))
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
    iframe.srcdoc = `<!doctype html><html><head><style data-frameboard data-hash="${HASH}"></style>${BRIDGE}</head><body>${body}</body></html>`
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

  it('shows every Design section for an element holding text alone', async () => {
    await mountFrame('<h1>Hello</h1>')

    renderWith(3)

    // The sections draw once the frame answers the element's live reading.
    await screen.findByRole('region', { name: 'Position' })
    const headings = await screen.findAllByRole('heading')
    expect(headings.map((heading) => heading.textContent)).toEqual([
      'Frame',
      'Position',
      'Layout',
      'Appearance',
      '3D',
      'Typography',
      'Fill',
      'Text',
      'Stroke',
      'Shadow',
      'Present',
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

  it('reads where centered text alone would start once shrunk to its words, beside its own box', async () => {
    await mountFrame(
      '<p style="margin: 0; padding: 4px; border: 2px solid; text-align: center">Hi</p>',
    )
    const { result } = renderHook(() =>
      useLiveElement({ frame: HERO.ref, index: 3, hash: HASH }),
    )
    const paragraph = document
      .querySelector<HTMLIFrameElement>(`[data-frame="${HERO.ref}"] iframe`)
      ?.contentDocument?.querySelector('p')
    const words = paragraph?.ownerDocument.createRange()
    if (!paragraph || !words) throw new Error('the frame holds no paragraph')
    words.selectNodeContents(paragraph)

    await waitFor(() => expect(result.current).not.toBeNull())
    expect(result.current?.placement).toMatchObject({
      left: Math.round(paragraph.getBoundingClientRect().left),
      wordsLeft: Math.round(words.getBoundingClientRect().left - 6),
    })
  })

  it('reads no words left for text holding an element', async () => {
    await mountFrame(
      '<p style="margin: 0; text-align: center">Hi <b>there</b></p>',
    )
    const { result } = renderHook(() =>
      useLiveElement({ frame: HERO.ref, index: 3, hash: HASH }),
    )

    await waitFor(() => expect(result.current).not.toBeNull())
    expect(result.current?.placement.wordsLeft).toBeNull()
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

  it.each([
    ['border: 3px solid', 3],
    ['border: solid; border-width: 1px 2px', null],
  ])('reads the border width of %s', async (style, width) => {
    await mountFrame(`<div style="${style}"></div>`)
    const { result } = renderHook(() =>
      useLiveElement({ frame: HERO.ref, index: 3, hash: HASH }),
    )

    await waitFor(() => expect(result.current).not.toBeNull())
    expect(result.current?.borderWidth).toBe(width)
  })

  it('puts a token border shorthand back whole once a width preview ends', async () => {
    await mountFrame(
      '<style>:root { --edge: red }</style><div style="border: 4px solid var(--edge)"></div>',
    )
    const key = { frame: HERO.ref, index: 4, hash: HASH }
    const node = document
      .querySelector<HTMLIFrameElement>(`[data-frame="${HERO.ref}"] iframe`)
      ?.contentDocument?.querySelector('div')
    if (!node) throw new Error('the frame holds no div')

    previewStyle(key, 'border-width', '9px')
    previewStyle(key, 'border-width', null)

    expect(node.getAttribute('style')).toBe('border: 4px solid var(--edge)')
    expect(
      node.ownerDocument.defaultView?.getComputedStyle(node).borderTopWidth,
    ).toBe('4px')
  })

  it('reads a one-line truncation and the type details it sets', async () => {
    await mountFrame(
      '<p style="overflow: hidden; white-space: nowrap; text-overflow: ellipsis; text-decoration-line: underline; text-transform: uppercase; text-wrap-style: balance">Hi</p>',
    )
    const { result } = renderHook(() =>
      useLiveElement({ frame: HERO.ref, index: 3, hash: HASH }),
    )

    await waitFor(() => expect(result.current).not.toBeNull())
    expect(result.current).toMatchObject({
      truncated: true,
      textDecorationLine: 'underline',
      textTransform: 'uppercase',
      textWrapStyle: 'balance',
    })
  })

  it('reads a clipped line with no ellipsis as not truncated', async () => {
    await mountFrame('<p style="overflow: hidden; white-space: nowrap">Hi</p>')
    const { result } = renderHook(() =>
      useLiveElement({ frame: HERO.ref, index: 3, hash: HASH }),
    )

    await waitFor(() => expect(result.current).not.toBeNull())
    expect(result.current).toMatchObject({ truncated: false })
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
    expect(result.current).toMatchObject({
      lineHeight: null,
      letterSpacing: 0,
    })
  })

  it('reads the element’s own rotate and scale and a translating transform', async () => {
    await mountFrame(
      '<div style="transform: translate(-50%, -50%); rotate: 0.25turn; scale: -1.5 1.5"></div>',
    )
    const { result } = renderHook(() =>
      useLiveElement({ frame: HERO.ref, index: 3, hash: HASH }),
    )

    await waitFor(() => expect(result.current).not.toBeNull())
    expect(result.current?.rotation).toEqual({
      degrees: 90,
      scale: { x: -1.5, y: 1.5 },
      own: { rotate: 0, scale: { x: 1, y: 1 } },
      translated: true,
      transform: {
        own: 'translate(-50%, -50%)',
        ruled: false,
        reanchors: false,
      },
    })
  })

  it('reads a rotating transform as no translation and no rotate', async () => {
    await mountFrame('<div style="transform: rotate(45deg)"></div>')
    const { result } = renderHook(() =>
      useLiveElement({ frame: HERO.ref, index: 3, hash: HASH }),
    )

    await waitFor(() => expect(result.current).not.toBeNull())
    expect(result.current?.rotation).toEqual({
      degrees: 0,
      scale: { x: 1, y: 1 },
      own: {},
      translated: false,
      transform: { own: 'rotate(45deg)', ruled: false, reanchors: false },
    })
  })

  it('reads a rule’s rotate and scale under the element’s own, leaving its style as written', async () => {
    await mountFrame(
      '<div style="rotate: 0deg; scale: 1 1"></div><style>div { rotate: 90deg; scale: -1 1 }</style>',
    )
    const { result } = renderHook(() =>
      useLiveElement({ frame: HERO.ref, index: 3, hash: HASH }),
    )

    await waitFor(() => expect(result.current).not.toBeNull())
    expect(result.current?.rotation.own).toEqual({
      rotate: 90,
      scale: { x: -1, y: 1 },
    })
    expect(
      document
        .querySelector<HTMLIFrameElement>(`[data-frame="${HERO.ref}"] iframe`)
        ?.contentDocument?.querySelector('div')
        ?.getAttribute('style'),
    ).toBe('rotate: 0deg; scale: 1 1')
  })

  it('reads a 3D rotate as unreadable', async () => {
    await mountFrame('<div style="rotate: x 30deg"></div>')
    const { result } = renderHook(() =>
      useLiveElement({ frame: HERO.ref, index: 3, hash: HASH }),
    )

    await waitFor(() => expect(result.current).not.toBeNull())
    expect(result.current?.rotation.degrees).toBeNull()
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
        if (url.includes('/fonts/installed')) {
          return Response.json({
            ok: true,
            data: { version: 1, project: 'studio', fonts: [] },
          })
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
              fontFamily: null,
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
                  fontFamily: null,
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

  it('shows the frame as one crumb row with no name field or box while an element is selected', async () => {
    await mountFrame('<h1>Hello</h1>')

    renderWith(3)

    await screen.findByRole('heading', { name: 'Appearance' })
    expect(screen.getByRole('region', { name: 'Frame' })).toHaveTextContent(
      'hero',
    )
    expect(
      screen.queryByRole('button', { name: 'Rename frame hero' }),
    ).toBeNull()
    expect(screen.queryByRole('textbox', { name: 'X position' })).toBeNull()
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
      // Export, the row leading to Slides, and a label's tip write nothing to the board, so they stay live in a tab that reads.
      (control) =>
        !control.closest(
          '[aria-labelledby="inspector-frame"], [aria-labelledby="inspector-export"], [aria-labelledby="inspector-present-row"]',
        ) && !control.matches('[aria-label^="About "]'),
    )
    expect(controls.length).toBeGreaterThan(5)
    expect(controls.filter((control) => !control.matches(':disabled'))).toEqual(
      [],
    )
  })

  it('reads an in-flow child’s offsets from its parent’s padding box', async () => {
    await mountFrame(
      '<div style="margin: 0; padding: 10px; border: 2px solid"><p style="margin: 0">Hi</p></div>',
    )
    const { result } = renderHook(() =>
      useLiveElement({ frame: HERO.ref, index: 4, hash: HASH }),
    )

    await waitFor(() => expect(result.current).not.toBeNull())
    expect(result.current?.placement).toMatchObject({
      free: false,
      left: 10,
      top: 10,
    })
  })

  it('reads a body child’s offsets from the frame', async () => {
    await mountFrame('<p style="margin: 0">Hi</p>')
    const { result } = renderHook(() =>
      useLiveElement({ frame: HERO.ref, index: 3, hash: HASH }),
    )

    await waitFor(() => expect(result.current).not.toBeNull())
    expect(result.current?.placement).toMatchObject({
      free: false,
      left: 8,
      top: 8,
    })
  })

  it('reads a placed element’s own offsets', async () => {
    await mountFrame(
      '<div style="position: relative"><p style="position: absolute; left: 7px; top: 9px; margin: 0">Hi</p></div>',
    )
    const { result } = renderHook(() =>
      useLiveElement({ frame: HERO.ref, index: 4, hash: HASH }),
    )

    await waitFor(() => expect(result.current).not.toBeNull())
    expect(result.current?.placement).toMatchObject({
      free: true,
      left: 7,
      top: 9,
    })
  })
})
