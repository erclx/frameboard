import '../styles.css'

import { act, render } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'

import { bindKeys, registerActions } from '@/client/actions/registry'
import { createStructure } from '@/client/live/structure'
import { chooseTheme, flipFrame, themeStore } from '@/client/theme/store'
import type { Finding } from '@/shared/records/check'
import type { FrameRecord } from '@/shared/records/list'

import { openFindings } from './findings-open'
import { Frame, LabelRename } from './frame'
import { modeStore } from './mode'
import { endPreview, setPreview } from './preview/store'
import {
  renamingFrame,
  startFrameRename,
  stopFrameRename,
} from './structure/actions'

function frame(name: string): FrameRecord {
  return {
    ref: `studio/home/${name}`,
    project: 'studio',
    page: 'home',
    name,
    path: `/board/studio/home/${name}.html`,
    box: { x: 0, y: 0, width: 390, height: 844 },
    order: 0,
    hidden: false,
    locked: false,
    hugWidth: false,
    hugHeight: false,
    placed: true,
    modifiedAt: '2026-10-15T00:00:00.000Z',
  }
}

function finding(
  message: string,
  severity: Finding['severity'] = 'error',
): Finding {
  return {
    rule: 'theme',
    severity,
    frame: 'studio/home/a',
    path: 'studio/home/a.html',
    message,
    location: null,
  }
}

function Pair({ a, b }: { a: number; b: number }) {
  return (
    <>
      <Frame frame={frame('a')} live version={a} />
      <Frame frame={frame('b')} live version={b} />
    </>
  )
}

function iframeOf(container: HTMLElement, name: string): HTMLIFrameElement {
  const iframe = container.querySelector<HTMLIFrameElement>(
    `[data-frame="studio/home/${name}"] iframe`,
  )
  if (!iframe) throw new Error(`no iframe for ${name}`)
  return iframe
}

/** tinykeys reads a press only when it carries both a key and a code. */
function pressEscapeIn(iframe: HTMLIFrameElement): void {
  const inner = iframe.contentWindow as typeof window | null
  inner?.document.dispatchEvent(
    new inner.KeyboardEvent('keydown', {
      key: 'Escape',
      code: 'Escape',
      bubbles: true,
    }),
  )
}

function loaded(iframe: HTMLIFrameElement): Promise<void> {
  return new Promise((resolve) =>
    iframe.addEventListener('load', () => resolve(), { once: true }),
  )
}

describe('Frame in Play', () => {
  const cleanups: (() => void)[] = []

  afterEach(() => {
    while (cleanups.length > 0) cleanups.pop()?.()
    act(() => modeStore.setState({ mode: 'edit' }))
  })

  it('hands Esc pressed inside the frame to the board, once per press after a reload', async () => {
    let exits = 0
    cleanups.push(
      registerActions([
        {
          id: 'mode.exitPlay',
          label: 'Exit Play',
          group: 'mode',
          palette: false,
          keys: ['Escape'],
          run: () => (exits += 1),
        },
      ]),
    )
    act(() => modeStore.setState({ mode: 'play' }))
    const { container, rerender } = render(
      <Frame frame={frame('a')} live version={0} />,
    )
    await loaded(iframeOf(container, 'a'))
    const reloaded = loaded(iframeOf(container, 'a'))

    rerender(<Frame frame={frame('a')} live version={1} />)
    await reloaded
    pressEscapeIn(iframeOf(container, 'a'))

    expect(exits).toBe(1)
  })
})

describe('Frame', () => {
  it('loads its frame url with its reload counter', () => {
    const { container } = render(<Pair a={2} b={0} />)

    expect(iframeOf(container, 'a').getAttribute('src')).toBe(
      '/frames/studio/home/a.html?theme=light&v=2',
    )
  })

  it('reloads only the frame whose counter changed', () => {
    const { container, rerender } = render(<Pair a={0} b={0} />)
    const untouched = iframeOf(container, 'b')

    rerender(<Pair a={1} b={0} />)

    expect(iframeOf(container, 'a').getAttribute('src')).toMatch(/&v=1$/)
    expect(iframeOf(container, 'b')).toBe(untouched)
    expect(untouched.getAttribute('src')).toMatch(/&v=0$/)
  })

  it('keeps the page it loaded when only its ref is renamed', () => {
    const { container, rerender } = render(
      <Frame frame={frame('a')} live version={0} />,
    )

    rerender(
      <Frame
        frame={{ ...frame('a'), ref: 'studio/start/a', page: 'start' }}
        live
        version={0}
      />,
    )

    expect(container.querySelector('iframe')?.getAttribute('src')).toBe(
      '/frames/studio/home/a.html?theme=light&v=0',
    )
  })

  it('reloads a renamed frame from its new path', () => {
    const renamed = { ...frame('a'), ref: 'studio/start/a', page: 'start' }
    const { container, rerender } = render(
      <Frame frame={frame('a')} live version={0} />,
    )
    rerender(<Frame frame={renamed} live version={0} />)

    rerender(<Frame frame={renamed} live version={1} />)

    expect(container.querySelector('iframe')?.getAttribute('src')).toBe(
      '/frames/studio/start/a.html?theme=light&v=1',
    )
  })

  it('draws a placeholder rather than a page when not live', () => {
    const { container } = render(
      <Frame frame={frame('far')} live={false} version={0} />,
    )

    expect(container.querySelector('iframe')).toBeNull()
    expect(container.querySelector('[data-placeholder]')).not.toBeNull()
  })

  it('marks a locked frame on its label', () => {
    const { getByRole } = render(
      <Frame
        frame={{ ...frame('checkout'), locked: true }}
        live={false}
        version={0}
      />,
    )

    expect(getByRole('img', { name: 'Locked' })).toBeInTheDocument()
  })

  it('marks the label of a frame an agent changed', () => {
    const { getByRole } = render(
      <Frame frame={frame('checkout')} live={false} version={0} unseen />,
    )

    expect(getByRole('img', { name: 'Unseen change' })).toBeInTheDocument()
  })

  it('leaves the unseen mark to the claim while the frame is claimed', () => {
    const { queryByRole } = render(
      <Frame
        frame={frame('checkout')}
        live={false}
        version={0}
        unseen
        claim={{
          frame: 'studio/home/checkout',
          session: 's-1',
          agent: 'claude',
          tag: 'claude · studio',
          claimedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
        }}
      />,
    )

    expect(queryByRole('img', { name: 'Unseen change' })).toBeNull()
  })

  it('names the frame above it', () => {
    const { getByTitle } = render(
      <Frame frame={frame('checkout')} live={false} version={0} />,
    )

    expect(getByTitle('checkout')).toHaveTextContent('checkout')
  })

  it('marks the label with the count of its findings and lists each one', () => {
    const { getByRole } = render(
      <Frame
        frame={frame('checkout')}
        live={false}
        version={0}
        findings={[finding('One theme alone.'), finding('Default font.')]}
      />,
    )

    const mark = getByRole('button', { name: '2 check findings' })
    expect(mark).toHaveTextContent('2')
  })

  describe('findings popover', () => {
    const FINDINGS: Finding[] = [
      {
        ...finding('Sets its own colors for one theme alone.'),
        location: { line: 7, column: 3, startOffset: 60, endOffset: 91 },
      },
      {
        ...finding('Grows with the viewport.', 'warning'),
        rule: 'viewport',
      },
    ]

    afterEach(() => {
      act(() => openFindings(null))
    })

    function renderMarked() {
      return render(
        <Frame
          frame={frame('checkout')}
          live={false}
          version={0}
          findings={FINDINGS}
        />,
      )
    }

    it('lists each finding by rule, line, and message once opened', async () => {
      const { findByRole } = renderMarked()

      act(() => openFindings('studio/home/checkout'))

      const list = await findByRole('dialog', {
        name: '2 findings on checkout',
      })
      expect(
        [...list.querySelectorAll('li')].map((item) => item.textContent),
      ).toEqual([
        'theme · line 7Sets its own colors for one theme alone.',
        'viewportGrows with the viewport.',
      ])
    })

    it('opens from the badge by keyboard', async () => {
      const { getByRole, findByRole } = renderMarked()

      getByRole('button', { name: '2 check findings' }).focus()
      await userEvent.keyboard('{Enter}')

      expect(await findByRole('dialog')).toBeInTheDocument()
    })

    it('closes on Esc before the board clears the selection', async () => {
      let clears = 0
      const unregister = registerActions([
        {
          id: 'selection.clear',
          label: 'Clear selection',
          group: 'selection',
          palette: false,
          keys: ['Escape'],
          run: () => {
            clears += 1
          },
        },
      ])
      const unbind = bindKeys(window)
      const { findByRole, queryByRole } = renderMarked()
      act(() => openFindings('studio/home/checkout'))
      await findByRole('dialog')

      await userEvent.keyboard('{Escape}')

      await expect.poll(() => queryByRole('dialog')).toBeNull()
      expect(clears).toBe(0)
      unbind()
      unregister()
    })
  })

  it('marks the pill error when any finding is an error', () => {
    const { getByRole } = render(
      <Frame
        frame={frame('checkout')}
        live={false}
        version={0}
        findings={[
          finding('Sized off the viewport.', 'warning'),
          finding('Cut off.'),
        ]}
      />,
    )

    expect(getByRole('button', { name: /check finding/ })).toHaveAttribute(
      'data-severity',
      'error',
    )
  })

  it('marks the pill warning when every finding is a warning', () => {
    const { getByRole } = render(
      <Frame
        frame={frame('checkout')}
        live={false}
        version={0}
        findings={[finding('Sized off the viewport.', 'warning')]}
      />,
    )

    expect(getByRole('button', { name: /check finding/ })).toHaveAttribute(
      'data-severity',
      'warning',
    )
  })

  it('tints an error pill in the destructive hue and a warning pill in the note hue', () => {
    const { getAllByRole } = render(
      <>
        <Frame
          frame={frame('a')}
          live={false}
          version={0}
          findings={[finding('Cut off.')]}
        />
        <Frame
          frame={frame('b')}
          live={false}
          version={0}
          findings={[finding('Sized off the viewport.', 'warning')]}
        />
      </>,
    )
    const hue = (element: HTMLElement) =>
      getComputedStyle(element).getPropertyValue('--h').trim()

    const [error, warning] = getAllByRole('button', { name: /check finding/ })

    expect(error && hue(error)).toBe(
      getComputedStyle(document.documentElement)
        .getPropertyValue('--destructive')
        .trim(),
    )
    expect(warning && hue(warning)).toBe(
      getComputedStyle(document.documentElement)
        .getPropertyValue('--note')
        .trim(),
    )
  })

  it('marks nothing for a frame with no findings', () => {
    const { queryByRole } = render(
      <Frame
        frame={frame('checkout')}
        live={false}
        version={0}
        findings={[]}
      />,
    )

    expect(queryByRole('button', { name: /check finding/ })).toBeNull()
  })

  it('truncates the name and keeps the count on a narrow frame', () => {
    const narrow = {
      ...frame('a-very-long-frame-name-that-cannot-fit'),
      box: { x: 0, y: 0, width: 60, height: 100 },
    }
    const { getByRole, getByText } = render(
      <div className="relative" style={{ paddingTop: 40 }}>
        <Frame
          frame={narrow}
          live={false}
          version={0}
          findings={[finding('One theme alone.')]}
        />
      </div>,
    )

    const name = getByText(narrow.name)
    expect(name.scrollWidth).toBeGreaterThan(name.clientWidth)
    expect(
      getByRole('button', { name: /check finding/ }).getBoundingClientRect()
        .right,
    ).toBeLessThanOrEqual(
      Math.ceil(name.parentElement?.getBoundingClientRect().right ?? 0),
    )
  })

  it('keeps the count on a claimed narrow frame, truncating the claim tag', () => {
    const narrow = {
      ...frame('pricing'),
      box: { x: 0, y: 0, width: 136, height: 100 },
    }
    const { container, getByRole } = render(
      <div className="relative" style={{ paddingTop: 40 }}>
        <Frame
          frame={narrow}
          live={false}
          version={0}
          findings={[finding('One theme alone.'), finding('Default font.')]}
          claim={{
            frame: 'studio/home/pricing',
            session: 's-1',
            agent: 'claude',
            tag: 'claude · visual-style',
            claimedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          }}
        />
      </div>,
    )

    // The label box is capped at the frame's width while its children can
    // overflow it, so the frame's own edge is the one the badge must hold.
    const edge = container
      .querySelector('[data-frame]')
      ?.getBoundingClientRect().right
    expect(
      getByRole('button', { name: '2 check findings' }).getBoundingClientRect()
        .right,
    ).toBeLessThanOrEqual(Math.ceil(edge ?? 0))
  })
})

describe('Frame theme', () => {
  afterEach(() => {
    act(() =>
      themeStore.setState({
        choice: 'system',
        system: 'light',
        flipped: new Set(),
      }),
    )
  })

  it("writes a theme change into the frame's root with no reload", async () => {
    const { container } = render(<Frame frame={frame('a')} live version={0} />)
    const iframe = iframeOf(container, 'a')
    await loaded(iframe)
    const src = iframe.getAttribute('src')
    let loads = 0
    iframe.addEventListener('load', () => (loads += 1))

    act(() => chooseTheme('dark'))

    const root = iframe.contentDocument?.documentElement
    expect(root?.getAttribute('data-theme')).toBe('dark')
    expect(root?.style.colorScheme).toBe('dark')
    expect(root?.classList.contains('dark')).toBe(true)
    expect(iframe.style.colorScheme).toBe('dark')
    expect(iframe.getAttribute('src')).toBe(src)
    expect(loads).toBe(0)
  })

  it('serves a frame that reloads after a theme change in the new theme', () => {
    const { container, rerender } = render(
      <Frame frame={frame('a')} live version={0} />,
    )
    act(() => chooseTheme('dark'))

    rerender(<Frame frame={frame('a')} live version={1} />)

    expect(iframeOf(container, 'a').getAttribute('src')).toBe(
      '/frames/studio/home/a.html?theme=dark&v=1',
    )
  })

  it('shows a flipped frame in the opposite theme and leaves the others', async () => {
    act(() => chooseTheme('dark'))
    const { container } = render(<Pair a={0} b={0} />)
    await Promise.all([
      loaded(iframeOf(container, 'a')),
      loaded(iframeOf(container, 'b')),
    ])

    act(() => flipFrame('studio/home/a'))

    expect(themeOfRoot(iframeOf(container, 'a'))).toBe('light')
    expect(iframeOf(container, 'a').style.colorScheme).toBe('light')
    expect(themeOfRoot(iframeOf(container, 'b'))).toBe('dark')
  })
})

function themeOfRoot(iframe: HTMLIFrameElement): string | null {
  return (
    iframe.contentDocument?.documentElement.getAttribute('data-theme') ?? null
  )
}

describe('Frame theme marker', () => {
  afterEach(() => {
    act(() =>
      themeStore.setState({
        choice: 'system',
        system: 'light',
        flipped: new Set(),
      }),
    )
  })

  it('keeps the sun of a frame following the board out of sight at rest', () => {
    const { container } = render(
      <Frame frame={frame('a')} live={false} version={0} />,
    )

    const marker = container.querySelector('[aria-label="Flip a to dark"]')
    expect(marker).not.toBeNull()
    expect(marker).not.toBeVisible()
  })

  it('draws the sun while the pointer is over the frame', () => {
    const { container, getByRole } = render(
      <Frame frame={frame('a')} live={false} version={0} />,
    )

    container
      .querySelector('[data-frame]')
      ?.setAttribute('data-label-hover', '')

    const marker = getByRole('button', { name: 'Flip a to dark' })
    expect(marker).toBeVisible()
    expect(marker).toHaveTextContent('')
    expect(marker.querySelector('svg')).not.toBeNull()
  })

  it.each([
    ['light', 'Dark', 'Flip a to light'],
    ['dark', 'Light', 'Flip a to dark'],
  ] as const)(
    'names the theme of a frame flipped on a %s board',
    (board, shown, label) => {
      act(() => chooseTheme(board))
      act(() => flipFrame('studio/home/a'))

      const { getByRole } = render(
        <Frame frame={frame('a')} live={false} version={0} />,
      )

      expect(getByRole('button', { name: label })).toHaveTextContent(shown)
    },
  )

  it('flips the frame back on a click', async () => {
    act(() => flipFrame('studio/home/a'))
    const { container, getByRole } = render(
      <Frame frame={frame('a')} live={false} version={0} />,
    )

    await userEvent.click(getByRole('button', { name: 'Flip a to light' }))

    expect(
      container.querySelector('[aria-label="Flip a to dark"]'),
    ).toHaveTextContent('')
  })
})

describe('Frame label at low zoom', () => {
  function renderCrowded(findings?: readonly Finding[]) {
    const view = render(
      <Frame
        frame={frame('checkout')}
        live={false}
        version={0}
        findings={findings}
      />,
    )
    const root = view.container.querySelector<HTMLElement>('[data-frame]')
    if (!root) throw new Error('no frame root')
    root.setAttribute('data-label-crowded', '')
    return { ...view, root }
  }

  it('hides a crowded label', () => {
    const { getByTitle } = renderCrowded()

    expect(getByTitle('checkout')).not.toBeVisible()
  })

  it('shows a crowded label under the pointer', () => {
    const { getByTitle, root } = renderCrowded()

    root.setAttribute('data-label-hover', '')

    expect(getByTitle('checkout')).toBeVisible()
  })

  describe('on a previewed frame', () => {
    afterEach(() => {
      act(() => endPreview(['studio/home/checkout']))
    })

    it('hides the preview chip with a crowded label', () => {
      act(() => setPreview(['studio/home/checkout'], 390))
      const { container } = renderCrowded()

      expect(container.querySelector('[data-preview-chip]')).not.toBeVisible()
    })

    it('shows the preview chip with a crowded label under the pointer', () => {
      act(() => setPreview(['studio/home/checkout'], 390))
      const { container, root } = renderCrowded()

      root.setAttribute('data-label-hover', '')

      expect(container.querySelector('[data-preview-chip]')).toBeVisible()
    })
  })

  it('shows a crowded label while the frame is selected', () => {
    const { getByTitle, root } = renderCrowded()

    root.setAttribute('data-selected', 'true')

    expect(getByTitle('checkout')).toBeVisible()
  })

  it('keeps a findings dot on the corner of a crowded frame', () => {
    const { container } = renderCrowded([finding('Raw color')])

    const dot = container.querySelector<HTMLElement>('[data-findings-dot]')
    expect(dot).toBeVisible()
    expect(dot?.dataset.findingsBadge).toBe('studio/home/checkout')
  })

  it('centers the findings dot on the top left corner, clear of a frame note', () => {
    const { container, root } = renderCrowded([finding('Raw color')])

    const dot = container.querySelector<HTMLElement>('[data-findings-dot]')
    const box = dot?.getBoundingClientRect()
    const corner = root.getBoundingClientRect()
    expect(box && box.left + box.width / 2).toBeCloseTo(corner.left, 0)
    expect(box && box.top + box.height / 2).toBeCloseTo(corner.top, 0)
  })

  it('draws no findings dot while the label shows', () => {
    const { container } = render(
      <Frame
        frame={frame('checkout')}
        live={false}
        version={0}
        findings={[finding('Raw color')]}
      />,
    )

    expect(container.querySelector('[data-findings-dot]')).not.toBeVisible()
  })
})

describe('Frame preview', () => {
  afterEach(() => {
    act(() => endPreview(['studio/home/a']))
  })

  it('lays the live page out at the previewed width without reloading it', async () => {
    const { container } = render(<Frame frame={frame('a')} live version={0} />)
    const iframe = iframeOf(container, 'a')
    await loaded(iframe)
    const src = iframe.getAttribute('src')
    let loads = 0
    iframe.addEventListener('load', () => (loads += 1))

    act(() => setPreview(['studio/home/a'], 1440))

    expect(iframe.contentWindow?.innerWidth).toBe(1440)
    expect(iframe.getAttribute('src')).toBe(src)
    expect(loads).toBe(0)
  })

  it("flips the page's width media queries", async () => {
    const { container } = render(<Frame frame={frame('a')} live version={0} />)
    const iframe = iframeOf(container, 'a')
    await loaded(iframe)
    const phone = () => iframe.contentWindow?.matchMedia('(max-width: 600px)')
    const before = phone()?.matches

    act(() => setPreview(['studio/home/a'], 1440))

    expect(before).toBe(true)
    expect(phone()?.matches).toBe(false)
  })

  it('marks the label with the previewed width', () => {
    const { container } = render(<Frame frame={frame('a')} live version={0} />)

    act(() => setPreview(['studio/home/a'], 834))

    expect(container.querySelector('[data-preview-chip]')).toHaveTextContent(
      'Preview 834',
    )
  })

  it('draws a hugging height at its content height for the previewed width', async () => {
    const hugging = { ...frame('a'), hugHeight: true }
    const { container } = render(<Frame frame={hugging} live version={0} />)
    const iframe = iframeOf(container, 'a')
    await loaded(iframe)
    const document = iframe.contentDocument
    if (!document) throw new Error('no frame document')
    document.body.innerHTML = '<div style="height:320px"></div>'
    document.body.style.margin = '0'

    act(() => setPreview(['studio/home/a'], 1440))

    const root = container.querySelector<HTMLElement>('[data-frame]')
    expect(root?.style.height).toBe('320px')
  })

  it('keeps a fixed height at a previewed width', async () => {
    const { container } = render(<Frame frame={frame('a')} live version={0} />)
    const iframe = iframeOf(container, 'a')
    await loaded(iframe)
    iframe.contentDocument?.body.replaceChildren()

    act(() => setPreview(['studio/home/a'], 1440))

    const root = container.querySelector<HTMLElement>('[data-frame]')
    expect(root?.style.height).toBe('844px')
  })

  it('keeps the chip inside the label of a narrow frame, truncating the name first', () => {
    const narrow = {
      ...frame('a'),
      name: 'a-very-long-frame-name-that-cannot-fit',
      box: { x: 0, y: 0, width: 60, height: 844 },
    }
    const { container, getByText } = render(
      <div className="relative" style={{ paddingTop: 40 }}>
        <Frame frame={narrow} live={false} version={0} />
      </div>,
    )

    act(() => setPreview(['studio/home/a'], 40))

    const chip = container.querySelector('[data-preview-chip]')
    const label = getByText(narrow.name).parentElement
    const name = getByText(narrow.name)
    expect(name.clientWidth).toBe(0)
    expect(chip?.getBoundingClientRect().right).toBeLessThanOrEqual(
      Math.ceil(label?.getBoundingClientRect().right ?? 0),
    )
  })

  it('gives a label narrowed by a preview the room its stored box holds', () => {
    const named = { ...frame('a'), name: 'checkout-summary-mobile' }
    const { container, getByText } = render(
      <div className="relative" style={{ paddingTop: 40 }}>
        <Frame frame={named} live={false} version={0} />
      </div>,
    )

    act(() => setPreview(['studio/home/a'], 60))

    const name = getByText(named.name)
    expect(name.scrollWidth).toBeLessThanOrEqual(name.clientWidth)
    expect(container.querySelector('[data-preview-chip]')).toBeVisible()
  })

  it('draws at its stored width once the preview ends', () => {
    const { container } = render(<Frame frame={frame('a')} live version={0} />)
    act(() => setPreview(['studio/home/a'], 834))

    act(() => endPreview(['studio/home/a']))

    const root = container.querySelector<HTMLElement>('[data-frame]')
    expect(root?.style.width).toBe('390px')
    expect(container.querySelector('[data-preview-chip]')).toBeNull()
  })
})

describe('LabelRename', () => {
  const HERO = frame('hero')

  /** A server answering each rename with the frame under its new name, recording each body. */
  function server() {
    const sent: unknown[] = []
    const calls = createStructure(async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as { name: string }
      sent.push(body)
      return Response.json({ ...HERO, name: body.name })
    })
    return { calls, sent }
  }

  afterEach(() => act(() => stopFrameRename()))

  it('opens a field holding the name while the canvas renames the frame', () => {
    const { calls } = server()
    const view = render(<LabelRename frames={[HERO]} calls={calls} />)

    act(() => startFrameRename(HERO.ref, 'canvas'))

    expect(
      view.getByRole('textbox', { name: 'Rename frame hero' }),
    ).toHaveValue('hero')
  })

  it('hugs a short name on a frame wider than the field', () => {
    const { calls } = server()
    const view = render(<LabelRename frames={[HERO]} calls={calls} />)

    act(() => startFrameRename(HERO.ref, 'canvas'))

    const { width } = view
      .getByRole('textbox', { name: 'Rename frame hero' })
      .getBoundingClientRect()
    expect(width).toBeGreaterThan(20)
    expect(width).toBeLessThan(80)
  })

  it('stops a long name at 240 screen pixels on a frame wider than that', async () => {
    const { calls } = server()
    const view = render(<LabelRename frames={[HERO]} calls={calls} />)
    act(() => startFrameRename(HERO.ref, 'canvas'))

    await userEvent.keyboard(`{End}${'x'.repeat(80)}`)

    const field = view.getByRole('textbox', { name: 'Rename frame hero' })
    expect(field.getBoundingClientRect().width).toBe(240)
  })

  it('opens no field while another surface renames the frame', () => {
    const { calls } = server()
    const view = render(<LabelRename frames={[HERO]} calls={calls} />)

    act(() => startFrameRename(HERO.ref, 'inspector'))

    expect(view.queryByRole('textbox')).toBeNull()
  })

  it('renames the frame on Enter and closes the field', async () => {
    const { calls, sent } = server()
    const view = render(<LabelRename frames={[HERO]} calls={calls} />)
    act(() => startFrameRename(HERO.ref, 'canvas'))

    await userEvent.keyboard('cover{Enter}')

    expect(sent).toEqual([{ ref: HERO.ref, name: 'cover' }])
    expect(view.queryByRole('textbox')).toBeNull()
  })

  it('closes on Esc with nothing sent and the key kept from the board', async () => {
    const { calls, sent } = server()
    let reached = false
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') reached = true
    }
    window.addEventListener('keydown', onKey)
    const view = render(<LabelRename frames={[HERO]} calls={calls} />)
    act(() => startFrameRename(HERO.ref, 'canvas'))

    await userEvent.keyboard('cover{Escape}')
    window.removeEventListener('keydown', onKey)

    expect([sent, renamingFrame().ref, reached]).toEqual([[], null, false])
    expect(view.queryByRole('textbox')).toBeNull()
  })
})

describe('Frame label while the canvas renames it', () => {
  afterEach(() => act(() => stopFrameRename()))

  it('hides the label the field draws over', () => {
    const { getByTitle } = render(
      <Frame frame={frame('hero')} live={false} version={0} />,
    )

    act(() => startFrameRename('studio/home/hero', 'canvas'))

    expect(getByTitle('hero')).not.toBeVisible()
  })
})
