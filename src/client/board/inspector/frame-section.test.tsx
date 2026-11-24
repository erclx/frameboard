import '../../styles.css'

import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { TooltipProvider } from '@/client/components/ui/tooltip'
import { liveStore } from '@/client/live/store'
import { createStructure } from '@/client/live/structure'
import { frameOf } from '@/test/board'
import { contrastOnPage } from '@/test/contrast'

import type { Box } from '../geometry/box'
import { endPreview, previewOf, setPreview } from '../preview/store'
import { FrameSection } from './frame-section'

const PAGE = 'studio/home'
const SWATCHES = frameOf('swatches', {
  name: 'Color swatches',
  box: { x: 460, y: 116, width: 640, height: 188 },
})
const SUNSET = frameOf('sunset', {
  box: { x: 460, y: 280, width: 640, height: 180 },
})

/** What a field reads, its value or the `Mixed` it shows where frames differ. */
function value(label: string): string {
  const field = screen.getByRole('textbox', { name: label }) as HTMLInputElement
  return field.value || field.placeholder
}

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

  describe('size menu', () => {
    const DESKTOP = frameOf('desktop', {
      box: { x: 1019, y: 1648, width: 1440, height: 900 },
    })
    const WIDE = frameOf('wide', {
      box: { x: 0, y: 0, width: 1920, height: 1080 },
    })

    it('names the size a frame measures beside its heading', () => {
      renderSection([DESKTOP])

      expect(
        screen.getByRole('button', { name: 'Frame' }),
      ).toHaveAccessibleDescription('Desktop')
    })

    it('names a size no row holds Custom', () => {
      renderSection([SWATCHES])

      expect(
        screen.getByRole('button', { name: 'Frame' }),
      ).toHaveAccessibleDescription('Custom')
    })

    it('names a size two rows share by the first in list order', () => {
      renderSection([WIDE])

      expect(
        screen.getByRole('button', { name: 'Frame' }),
      ).toHaveAccessibleDescription('Full HD')
    })

    it('names the size several frames share', () => {
      const other = frameOf('other', { box: { ...DESKTOP.box, x: 0 } })

      renderSection([DESKTOP, other])

      expect(
        screen.getByRole('button', { name: '2 frames' }),
      ).toHaveAccessibleDescription('Desktop')
    })

    it('reads Mixed over frames at different sizes', () => {
      renderSection([DESKTOP, WIDE])

      expect(
        screen.getByRole('button', { name: '2 frames' }),
      ).toHaveAccessibleDescription('Mixed')
    })

    it('checks the matched size in its group', async () => {
      renderSection([DESKTOP])

      await userEvent.click(screen.getByRole('button', { name: 'Frame' }))

      expect(
        within(await screen.findByRole('group', { name: 'Desktop' })).getByRole(
          'menuitemradio',
          { name: /^Desktop/ },
        ),
      ).toHaveAttribute('aria-checked', 'true')
      expect(
        screen.getAllByRole('menuitemradio', { checked: true }),
      ).toHaveLength(1)
    })

    it('lists every size under its group, social cards among them', async () => {
      renderSection([DESKTOP])

      await userEvent.click(screen.getByRole('button', { name: 'Frame' }))

      expect(await screen.findAllByRole('menuitemradio')).toHaveLength(18)
      expect(
        within(screen.getByRole('group', { name: 'Social' })).getAllByRole(
          'menuitemradio',
        ),
      ).toHaveLength(2)
      expect(
        within(screen.getByRole('group', { name: 'Slide' })).getAllByRole(
          'menuitemradio',
        ),
      ).toHaveLength(2)
      expect(
        within(screen.getByRole('group', { name: 'Slide' })).getByRole(
          'menuitemradio',
          { name: /Slide 16:9/ },
        ),
      ).toHaveTextContent('1920 × 1080')
    })

    it('lists the video sizes under Video, narrowest first', async () => {
      renderSection([DESKTOP])

      await userEvent.click(screen.getByRole('button', { name: 'Frame' }))

      expect(
        within(await screen.findByRole('group', { name: 'Video' }))
          .getAllByRole('menuitemradio')
          .map((row) => row.textContent),
      ).toEqual([
        expect.stringMatching(/Video portrait.*1080 × 1920/),
        expect.stringMatching(/Video landscape.*1920 × 1080/),
      ])
    })

    it('keeps the longest row on one line', async () => {
      renderSection([DESKTOP])

      await userEvent.click(screen.getByRole('button', { name: 'Frame' }))

      const longest = await screen.findByRole('menuitemradio', {
        name: /iPhone 16 Pro Max/,
      })
      const short = screen.getByRole('menuitemradio', { name: /^Phone/ })
      expect(longest.getBoundingClientRect().height).toBeCloseTo(
        short.getBoundingClientRect().height,
        0,
      )
    })

    it('sets W and H on a pick and keeps X and Y, in one write', async () => {
      const writes = renderSection([DESKTOP])

      await userEvent.click(screen.getByRole('button', { name: 'Frame' }))
      await userEvent.click(
        await screen.findByRole('menuitemradio', { name: /^iPhone 16\s*393/ }),
      )

      expect(writes).toEqual([
        {
          boxes: {
            [DESKTOP.ref]: { x: 1019, y: 1648, width: 393, height: 852 },
          },
        },
      ])
    })

    it('sizes each selected frame on a pick, skipping one already there', async () => {
      const writes = renderSection([DESKTOP, SWATCHES])

      await userEvent.click(screen.getByRole('button', { name: '2 frames' }))
      await userEvent.click(
        await screen.findByRole('menuitemradio', { name: /^Desktop/ }),
      )

      expect(writes).toEqual([
        {
          boxes: {
            [SWATCHES.ref]: { ...SWATCHES.box, width: 1440, height: 900 },
          },
        },
      ])
    })

    it('picks by keyboard and returns focus to the trigger on close', async () => {
      const writes = renderSection([DESKTOP])
      const trigger = screen.getByRole('button', { name: 'Frame' })

      trigger.focus()
      await userEvent.keyboard('{Enter}')
      await waitFor(() => expect(screen.getByRole('menu')).toBeVisible())
      await userEvent.keyboard('{ArrowDown}{Enter}')

      expect(writes).toHaveLength(1)
      await waitFor(() => expect(trigger).toHaveFocus())
    })

    it('closes on Escape with no write', async () => {
      const writes = renderSection([DESKTOP])
      const trigger = screen.getByRole('button', { name: 'Frame' })

      await userEvent.click(trigger)
      await screen.findByRole('menu')
      await userEvent.keyboard('{Escape}')

      await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
      expect(trigger).toHaveFocus()
      expect(writes).toEqual([])
    })

    it('disables the trigger on a locked frame', () => {
      renderSection([{ ...DESKTOP, locked: true }])

      expect(screen.getByRole('button', { name: 'Frame' })).toBeDisabled()
    })

    it('disables the trigger in a tab that may not write', () => {
      liveStore.setState({ canWrite: false })

      renderSection([DESKTOP])

      expect(screen.getByRole('button', { name: 'Frame' })).toBeDisabled()
    })
  })

  describe.each(['light', 'dark'])('in the %s theme', (theme) => {
    beforeEach(() => {
      document.documentElement.classList.toggle('dark', theme === 'dark')
    })

    afterEach(() => {
      document.documentElement.classList.remove('dark')
    })

    it('reads a field key letter at 4.5:1 or better on the field fill', () => {
      // The letter overlays a sibling input, so the wrapper stands in for its fill.
      render(
        <div className="bg-input">
          <FrameSection
            page={PAGE}
            frames={[SWATCHES]}
            write={async () => true}
          />
        </div>,
      )

      expect(contrastOnPage(screen.getByText('X'))).toBeGreaterThanOrEqual(4.5)
    })
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
        screen.getByRole('button', { name: /^Preview at phone width/ }),
      )

      expect(previewOf(SWATCHES.ref)).toEqual({ width: 390 })
      expect(
        screen.getByRole('button', { name: /^Preview at phone width/ }),
      ).toHaveAttribute('aria-pressed', 'true')
      expect(writes).toEqual([])
    })

    it('previews every selected frame at once', async () => {
      renderRow([SWATCHES, SUNSET])

      await userEvent.click(
        screen.getByRole('button', { name: /^Preview at phone width/ }),
      )

      expect([previewOf(SWATCHES.ref), previewOf(SUNSET.ref)]).toEqual([
        { width: 390 },
        { width: 390 },
      ])
    })

    it('leaves the Width field at the stored width under a preview', async () => {
      renderRow()

      await userEvent.click(
        screen.getByRole('button', { name: /^Preview at phone width/ }),
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

  describe('Height row', () => {
    /** A structure whose height write answers `answer`, recording each body sent. */
    function heightCalls(answer: () => Response) {
      const sent: unknown[] = []
      const calls = createStructure(async (_path, init) => {
        sent.push(JSON.parse(String(init?.body)))
        return answer()
      })
      return { sent, calls }
    }
    const checked = () =>
      within(screen.getByRole('radiogroup', { name: 'Height' }))
        .queryAllByRole('radio', { checked: true })
        .map((radio) => radio.textContent)

    it.each([
      ['Fixed', {}],
      ['Fit', { hugHeight: true }],
      ['Scroll', { scroll: true }],
    ])('reads %s off the frame', (mode, fields) => {
      render(<FrameSection page={PAGE} frames={[{ ...SWATCHES, ...fields }]} />)

      expect(checked()).toEqual([mode])
    })

    it('checks nothing and reads Mixed where frames differ', () => {
      render(
        <FrameSection
          page={PAGE}
          frames={[SWATCHES, { ...SUNSET, scroll: true }]}
        />,
      )

      expect(checked()).toEqual([])
      expect(screen.getByText('Mixed')).toBeInTheDocument()
    })

    it('posts a pick once for every frame with the boxes it drew', async () => {
      const { sent, calls } = heightCalls(() =>
        Response.json({ ok: true, data: [] }),
      )
      render(
        <FrameSection page={PAGE} frames={[SWATCHES, SUNSET]} calls={calls} />,
      )

      await userEvent.click(screen.getByRole('radio', { name: 'Scroll' }))

      expect(sent).toEqual([
        {
          refs: [SWATCHES.ref, SUNSET.ref],
          mode: 'scroll',
          expected: { [SWATCHES.ref]: SWATCHES.box, [SUNSET.ref]: SUNSET.box },
        },
      ])
      expect(checked()).toEqual(['Scroll'])
    })

    it('posts nothing for the mode already shown', async () => {
      const { sent, calls } = heightCalls(() =>
        Response.json({ ok: true, data: [] }),
      )
      render(<FrameSection page={PAGE} frames={[SWATCHES]} calls={calls} />)

      await userEvent.click(screen.getByRole('radio', { name: 'Fixed' }))

      expect(sent).toEqual([])
    })

    it('rolls back to the stored mode when the write is refused', async () => {
      const { calls } = heightCalls(() =>
        Response.json(
          { ok: false, error: { code: 'stale-layout', message: 'Moved.' } },
          { status: 409 },
        ),
      )
      render(<FrameSection page={PAGE} frames={[SWATCHES]} calls={calls} />)

      await userEvent.click(screen.getByRole('radio', { name: 'Fit' }))

      await waitFor(() => expect(checked()).toEqual(['Fixed']))
    })

    it('reads the stored mode again once an undo puts back the mode a pick left', async () => {
      const { calls } = heightCalls(() => Response.json({ ok: true, data: [] }))
      const scrolling = { ...SWATCHES, scroll: true }
      const { rerender } = render(
        <FrameSection page={PAGE} frames={[scrolling]} calls={calls} />,
      )
      await userEvent.click(screen.getByRole('radio', { name: 'Fit' }))

      rerender(
        <FrameSection
          page={PAGE}
          frames={[{ ...SWATCHES, hugHeight: true }]}
          calls={calls}
        />,
      )
      rerender(<FrameSection page={PAGE} frames={[scrolling]} calls={calls} />)

      expect(checked()).toEqual(['Scroll'])
    })

    describe('back to Scroll', () => {
      // Its own ref, since the height a pick leaving Scroll remembers lasts the tab.
      const SCREEN = frameOf('screen', {
        box: { x: 0, y: 0, width: 390, height: 844 },
        scroll: true,
      })
      const FITTED = {
        ...SCREEN,
        box: { ...SCREEN.box, height: 1992 },
        scroll: false,
        hugHeight: true,
      }
      const FIXED = { ...FITTED, hugHeight: false }

      it('sends the screen height the frame left Scroll at, through Fit and Fixed', async () => {
        const { sent, calls } = heightCalls(() =>
          Response.json({ ok: true, data: [] }),
        )
        const { rerender } = render(
          <FrameSection page={PAGE} frames={[SCREEN]} calls={calls} />,
        )
        await userEvent.click(screen.getByRole('radio', { name: 'Fit' }))
        rerender(<FrameSection page={PAGE} frames={[FITTED]} calls={calls} />)
        await userEvent.click(screen.getByRole('radio', { name: 'Fixed' }))
        rerender(<FrameSection page={PAGE} frames={[FIXED]} calls={calls} />)

        await userEvent.click(screen.getByRole('radio', { name: 'Scroll' }))

        expect(sent.at(-1)).toEqual({
          refs: [SCREEN.ref],
          mode: 'scroll',
          expected: { [SCREEN.ref]: FIXED.box },
          heights: { [SCREEN.ref]: 844 },
        })
      })

      it('sends no height once a height is typed while Fixed', async () => {
        const { sent, calls } = heightCalls(() =>
          Response.json({ ok: true, data: [] }),
        )
        const typed = { ...FIXED, box: { ...FIXED.box, height: 1500 } }
        const { rerender } = render(
          <FrameSection page={PAGE} frames={[SCREEN]} calls={calls} />,
        )
        await userEvent.click(screen.getByRole('radio', { name: 'Fit' }))
        rerender(<FrameSection page={PAGE} frames={[FITTED]} calls={calls} />)
        await userEvent.click(screen.getByRole('radio', { name: 'Fixed' }))
        rerender(<FrameSection page={PAGE} frames={[typed]} calls={calls} />)

        await userEvent.click(screen.getByRole('radio', { name: 'Scroll' }))

        expect(sent.at(-1)).not.toHaveProperty('heights')
      })
    })

    it('moves between modes by arrow key, picking each', async () => {
      const { sent, calls } = heightCalls(() =>
        Response.json({ ok: true, data: [] }),
      )
      render(<FrameSection page={PAGE} frames={[SWATCHES]} calls={calls} />)
      act(() => screen.getByRole('radio', { name: 'Fixed' }).focus())

      await userEvent.keyboard('{ArrowRight}')

      expect(screen.getByRole('radio', { name: 'Fit' })).toHaveFocus()
      expect(sent).toMatchObject([{ mode: 'fit' }])
    })

    it('stands disabled on a locked frame', () => {
      render(
        <FrameSection page={PAGE} frames={[{ ...SWATCHES, locked: true }]} />,
      )

      expect(screen.getByRole('radio', { name: 'Scroll' })).toBeDisabled()
    })
  })

  it('draws the More widths row for one frame and not for several', () => {
    const { rerender } = render(
      <FrameSection page={PAGE} frames={[SWATCHES]} />,
    )
    expect(
      screen.getByRole('group', { name: 'More widths' }),
    ).toBeInTheDocument()

    rerender(<FrameSection page={PAGE} frames={[SWATCHES, SUNSET]} />)

    expect(
      screen.queryByRole('group', { name: 'More widths' }),
    ).not.toBeInTheDocument()
  })

  describe('Show device', () => {
    /** A structure whose device write answers `answer`, recording each body sent. */
    function deviceCalls(answer: () => Response) {
      const sent: unknown[] = []
      const calls = createStructure(async (_path, init) => {
        sent.push(JSON.parse(String(init?.body)))
        return answer()
      })
      return { sent, calls }
    }
    const toggle = () => screen.getByRole('switch', { name: 'Show device' })
    const shownAt = (width: number) => ({
      ...SWATCHES,
      box: { ...SWATCHES.box, width },
      showDevice: true as const,
    })

    it('reads off while the frame shows no device, naming none', () => {
      render(<FrameSection page={PAGE} frames={[SWATCHES]} />)

      expect(toggle()).not.toBeChecked()
      expect(screen.queryByText('Tablet')).not.toBeInTheDocument()
    })

    it.each([
      [390, 'Phone'],
      [640, 'Tablet'],
      [1440, 'Laptop'],
    ])('names the device a %i wide frame shows', (width, name) => {
      render(<FrameSection page={PAGE} frames={[shownAt(width)]} />)

      expect(toggle()).toBeChecked()
      expect(toggle()).toHaveAccessibleDescription(
        expect.stringMatching(new RegExp(`^${name} `)),
      )
    })

    it('stays on under 320 wide, saying no device fits', () => {
      render(<FrameSection page={PAGE} frames={[shownAt(300)]} />)

      expect(toggle()).toBeChecked()
      expect(screen.getByText('No device fits')).toBeInTheDocument()
    })

    it('shows the device on every frame in one write', async () => {
      const { sent, calls } = deviceCalls(() =>
        Response.json({ ok: true, data: [] }),
      )
      render(
        <FrameSection page={PAGE} frames={[SWATCHES, SUNSET]} calls={calls} />,
      )

      await userEvent.click(toggle())

      expect(sent).toEqual([{ refs: [SWATCHES.ref, SUNSET.ref], show: true }])
      expect(toggle()).toBeChecked()
    })

    it('hides the device, sending show false', async () => {
      const { sent, calls } = deviceCalls(() =>
        Response.json({ ok: true, data: [] }),
      )
      render(<FrameSection page={PAGE} frames={[shownAt(640)]} calls={calls} />)

      await userEvent.click(toggle())

      expect(sent).toEqual([{ refs: [SWATCHES.ref], show: false }])
    })

    it('reads Mixed over frames that differ, and a press shows the device on both', async () => {
      const { sent, calls } = deviceCalls(() =>
        Response.json({ ok: true, data: [] }),
      )
      render(
        <FrameSection
          page={PAGE}
          frames={[shownAt(640), SUNSET]}
          calls={calls}
        />,
      )
      expect(screen.getByText('Mixed')).toBeInTheDocument()
      expect(toggle()).not.toBeChecked()

      await userEvent.click(toggle())

      expect(sent).toEqual([{ refs: [SWATCHES.ref, SUNSET.ref], show: true }])
    })

    it('reads Mixed over shown frames whose widths name different devices', () => {
      render(
        <FrameSection
          page={PAGE}
          frames={[shownAt(390), { ...SUNSET, showDevice: true }]}
        />,
      )

      expect(toggle()).toBeChecked()
      expect(screen.getByText('Mixed')).toBeInTheDocument()
    })

    describe('a foldable', () => {
      const ok = () => Response.json({ ok: true, data: [] })
      const folded = (pose: 'closed' | 'half' | 'open') => ({
        ...shownAt(890),
        device: 'foldable' as const,
        pose,
      })

      it('names Foldable over the width’s device, with its pose under the row', () => {
        render(<FrameSection page={PAGE} frames={[folded('half')]} />)

        expect(toggle()).toHaveAccessibleDescription(
          expect.stringMatching(/^Foldable /),
        )
        expect(
          screen.getByText('Half open. The pose is set on the canvas.'),
        ).toBeInTheDocument()
      })

      it('names no pose on a frame its width picks for', () => {
        render(<FrameSection page={PAGE} frames={[shownAt(890)]} />)

        expect(
          screen.queryByText(/The pose is set on the canvas/),
        ).not.toBeInTheDocument()
      })

      it('names a frame a foldable from the device menu', async () => {
        const { sent, calls } = deviceCalls(ok)
        render(
          <FrameSection page={PAGE} frames={[shownAt(390)]} calls={calls} />,
        )

        await userEvent.click(
          screen.getByRole('button', { name: 'Phone device' }),
        )
        await userEvent.click(
          await screen.findByRole('menuitemradio', { name: 'Foldable' }),
        )

        expect(sent).toEqual([{ refs: [SWATCHES.ref], foldable: true }])
      })

      it('hands a foldable back to its width from the device menu', async () => {
        const { sent, calls } = deviceCalls(ok)
        render(
          <FrameSection page={PAGE} frames={[folded('open')]} calls={calls} />,
        )

        await userEvent.click(
          screen.getByRole('button', { name: 'Foldable device' }),
        )
        await userEvent.click(
          await screen.findByRole('menuitemradio', { name: /^By width/ }),
        )

        expect(sent).toEqual([{ refs: [SWATCHES.ref], foldable: false }])
      })

      it('offers no device menu while the device is off', () => {
        render(<FrameSection page={PAGE} frames={[SWATCHES]} />)

        expect(
          screen.queryByRole('button', { name: /^\w+ device$/ }),
        ).not.toBeInTheDocument()
      })
    })

    it('toggles from its label as well as the switch', async () => {
      const { sent, calls } = deviceCalls(() =>
        Response.json({ ok: true, data: [] }),
      )
      render(<FrameSection page={PAGE} frames={[SWATCHES]} calls={calls} />)

      await userEvent.click(screen.getByText('Show device'))

      expect(sent).toEqual([{ refs: [SWATCHES.ref], show: true }])
    })

    it('describes the switch with the sentence its label’s mark shows on keyboard focus', async () => {
      render(
        <TooltipProvider>
          <FrameSection page={PAGE} frames={[SWATCHES]} />
        </TooltipProvider>,
      )
      const sentence =
        'Drawn by the board around the frame, a phone from 320 wide, a tablet from 480, and a laptop from 1024. The file is unchanged, and export can include it.'

      // Tab from the radio before the mark, as a keyboard reaches it.
      act(() => screen.getByRole('radio', { name: 'Fixed' }).focus())
      await userEvent.tab()

      expect(
        screen.getByRole('button', { name: 'About Show device' }),
      ).toHaveFocus()
      expect(toggle()).toHaveAccessibleDescription(sentence)
      // The hidden description holds one copy, so the open tip is the second.
      expect(await screen.findAllByText(sentence)).toHaveLength(2)
    })

    it('rolls back to off when the write is refused', async () => {
      const { calls } = deviceCalls(() =>
        Response.json(
          { ok: false, error: { code: 'frame-locked', message: 'Locked.' } },
          { status: 423 },
        ),
      )
      render(<FrameSection page={PAGE} frames={[SWATCHES]} calls={calls} />)

      await userEvent.click(toggle())

      await waitFor(() => expect(toggle()).not.toBeChecked())
    })
  })

  describe('Clip content', () => {
    /** A structure whose flag write answers `answer`, recording each body sent. */
    function flagCalls(answer: () => Response) {
      const sent: unknown[] = []
      const calls = createStructure(async (path, init) => {
        sent.push({ path, ...JSON.parse(String(init?.body)) })
        return answer()
      })
      return { sent, calls }
    }
    const ok = () => Response.json({ ok: true, data: [] })
    const toggle = () => screen.getByRole('switch', { name: 'Clip content' })
    const OPEN = { ...SWATCHES, showOverflow: true as const }

    it('reads on for a frame never switched', () => {
      render(<FrameSection page={PAGE} frames={[SWATCHES]} />)

      expect(toggle()).toBeChecked()
      expect(toggle()).toBeEnabled()
    })

    it('reads off for a frame showing its content past the edge', () => {
      render(<FrameSection page={PAGE} frames={[OPEN]} />)

      expect(toggle()).not.toBeChecked()
    })

    it('shows every frame past its edge in one write', async () => {
      const { sent, calls } = flagCalls(ok)
      render(
        <FrameSection page={PAGE} frames={[SWATCHES, SUNSET]} calls={calls} />,
      )

      await userEvent.click(toggle())

      expect(sent).toEqual([
        {
          path: '/api/frame/flag',
          refs: [SWATCHES.ref, SUNSET.ref],
          flag: 'showOverflow',
          on: true,
        },
      ])
      expect(toggle()).not.toBeChecked()
    })

    it('clips a frame again, clearing the flag', async () => {
      const { sent, calls } = flagCalls(ok)
      render(<FrameSection page={PAGE} frames={[OPEN]} calls={calls} />)

      await userEvent.click(toggle())

      expect(sent).toMatchObject([{ flag: 'showOverflow', on: false }])
      expect(toggle()).toBeChecked()
    })

    it('reads Mixed over frames that differ, and a press clips both', async () => {
      const { sent, calls } = flagCalls(ok)
      render(<FrameSection page={PAGE} frames={[OPEN, SUNSET]} calls={calls} />)
      expect(screen.getByText('Mixed')).toBeInTheDocument()
      expect(toggle()).not.toBeChecked()

      await userEvent.click(toggle())

      expect(sent).toMatchObject([
        { refs: [SWATCHES.ref, SUNSET.ref], on: false },
      ])
    })

    it('reads the stored flag again once an undo puts it back', async () => {
      const { calls } = flagCalls(ok)
      const { rerender } = render(
        <FrameSection page={PAGE} frames={[SWATCHES]} calls={calls} />,
      )
      await userEvent.click(toggle())
      rerender(<FrameSection page={PAGE} frames={[OPEN]} calls={calls} />)
      expect(toggle()).not.toBeChecked()

      rerender(<FrameSection page={PAGE} frames={[SWATCHES]} calls={calls} />)

      expect(toggle()).toBeChecked()
    })

    it.each([
      ['scrolls', { ...OPEN, scroll: true }],
      [
        'shows its device',
        { ...OPEN, showDevice: true, device: 'tablet' as const },
      ],
    ])('stands on and disabled for a frame that %s', (_name, frame) => {
      render(<FrameSection page={PAGE} frames={[frame]} />)

      expect(toggle()).toBeDisabled()
      expect(toggle()).toBeChecked()
    })

    it('reads on where only a frame that scrolls holds the flag, and writes both', async () => {
      const { sent, calls } = flagCalls(ok)
      render(
        <FrameSection
          page={PAGE}
          frames={[{ ...OPEN, scroll: true }, SUNSET]}
          calls={calls}
        />,
      )
      expect(toggle()).toBeChecked()
      expect(toggle()).toHaveAccessibleDescription(
        expect.not.stringMatching(/^Mixed/),
      )

      await userEvent.click(toggle())

      expect(sent).toMatchObject([
        { refs: [SWATCHES.ref, SUNSET.ref], on: true },
      ])
    })

    it('stays live over a scroll frame and one that can show past its edge', () => {
      render(
        <FrameSection
          page={PAGE}
          frames={[{ ...SWATCHES, scroll: true }, SUNSET]}
        />,
      )

      expect(toggle()).toBeEnabled()
    })

    it('stands disabled on a locked frame', () => {
      render(
        <FrameSection page={PAGE} frames={[{ ...SWATCHES, locked: true }]} />,
      )

      expect(toggle()).toBeDisabled()
    })

    it('rolls back to on when the write is refused, as an older server refuses the flag', async () => {
      const { calls } = flagCalls(() =>
        Response.json(
          { ok: false, error: { code: 'usage', message: 'Unknown flag.' } },
          { status: 400 },
        ),
      )
      render(<FrameSection page={PAGE} frames={[SWATCHES]} calls={calls} />)

      await userEvent.click(toggle())

      await waitFor(() => expect(toggle()).toBeChecked())
    })

    it('takes focus after Show device and turns on Space', async () => {
      const { sent, calls } = flagCalls(ok)
      render(
        <TooltipProvider>
          <FrameSection page={PAGE} frames={[SWATCHES]} calls={calls} />
        </TooltipProvider>,
      )
      act(() => screen.getByRole('switch', { name: 'Show device' }).focus())
      await userEvent.tab()
      expect(
        screen.getByRole('button', { name: 'About Clip content' }),
      ).toHaveFocus()

      await userEvent.tab()
      await userEvent.keyboard(' ')

      expect(toggle()).toHaveFocus()
      expect(sent).toMatchObject([{ flag: 'showOverflow', on: true }])
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
