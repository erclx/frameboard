import '../../styles.css'

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { Toaster } from '@/client/components/ui/toast'
import { createStructure } from '@/client/live/structure'
import type { FrameRecord } from '@/shared/records/list'
import { frameOf } from '@/test/board'

import { WidthsRow } from './widths-row'

const HERO = frameOf('hero', {
  box: { x: 0, y: 0, width: 1440, height: 900 },
  widths: [
    { width: 834, height: 1194 },
    { width: 390, height: 844 },
  ],
})

/** A structure whose widths write answers `answer`, recording each body sent. */
function widthsCalls(
  answer: () => Response = () => Response.json({ ok: true, data: [] }),
) {
  const sent: unknown[] = []
  const calls = createStructure(async (_path, init) => {
    sent.push(JSON.parse(String(init?.body)))
    return answer()
  })
  return { sent, calls }
}

function renderRow(
  frame: FrameRecord,
  disabled = false,
  calls = widthsCalls(),
) {
  render(
    <>
      <Toaster />
      <WidthsRow frame={frame} disabled={disabled} calls={calls.calls} />
    </>,
  )
  return calls.sent
}

const chips = () =>
  within(screen.getByRole('group', { name: 'Also shows at' }))
    .queryAllByRole('listitem')
    .map((item) => item.textContent)
    .filter(Boolean)

async function openMenu() {
  await userEvent.click(screen.getByRole('button', { name: 'Add a width' }))
  return screen.findByRole('menu')
}

describe('WidthsRow', () => {
  it('lists a chip per width in stored order', () => {
    renderRow(HERO)

    expect(chips()).toEqual(['834', '390'])
  })

  it('lists no chip for a frame listing none', () => {
    renderRow({ ...HERO, widths: [] })

    expect(chips()).toEqual([])
    expect(screen.getByRole('button', { name: 'Add a width' })).toBeEnabled()
  })

  it('posts a pick appended to the list, with the drawn list as expected', async () => {
    const sent = renderRow({ ...HERO, widths: [] })

    const menu = await openMenu()
    await userEvent.click(
      within(menu).getByRole('menuitem', { name: /^Tablet/ }),
    )

    expect(sent).toEqual([
      { refs: [HERO.ref], widths: [834], expected: { [HERO.ref]: [] } },
    ])
    expect(chips()).toEqual(['834'])
  })

  it('posts a remove without that width, with the drawn list as expected', async () => {
    const sent = renderRow(HERO)

    await userEvent.click(screen.getByRole('button', { name: 'Remove 834' }))

    expect(sent).toEqual([
      { refs: [HERO.ref], widths: [390], expected: { [HERO.ref]: [834, 390] } },
    ])
    expect(chips()).toEqual(['390'])
    expect(screen.getByRole('button', { name: 'Remove 390' })).toHaveFocus()
  })

  it('focuses the plus once the last chip is removed', async () => {
    renderRow({ ...HERO, widths: [{ width: 390, height: 844 }] })

    await userEvent.click(screen.getByRole('button', { name: 'Remove 390' }))

    expect(screen.getByRole('button', { name: 'Add a width' })).toHaveFocus()
  })

  it("leaves the frame's own width and each listed one out of the menu", async () => {
    renderRow(HERO)

    const menu = await openMenu()
    const widths = within(menu)
      .getAllByRole('menuitem')
      .map((item) => item.textContent?.match(/\d+$/)?.[0])

    expect(widths).not.toContain('1440')
    expect(widths).not.toContain('834')
    expect(widths).not.toContain('390')
    expect(widths.length).toBeGreaterThan(0)
  })

  it('puts the stored chips back and raises the toast when the write is refused', async () => {
    renderRow(
      HERO,
      false,
      widthsCalls(() =>
        Response.json(
          {
            ok: false,
            error: { code: 'stale-layout', message: 'Widths changed.' },
          },
          { status: 409 },
        ),
      ),
    )

    await userEvent.click(screen.getByRole('button', { name: 'Remove 834' }))

    expect(await screen.findByText('Widths changed.')).toBeInTheDocument()
    await waitFor(() => expect(chips()).toEqual(['834', '390']))
  })

  it('disables every chip and the plus while disabled, still listing the widths', () => {
    renderRow(HERO, true)

    expect(chips()).toEqual(['834', '390'])
    expect(screen.getByRole('button', { name: 'Remove 834' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Remove 390' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Add a width' })).toBeDisabled()
  })

  it('holds the plus with its reason for a frame hugging its width', async () => {
    const sent = renderRow({ ...HERO, widths: [], hugWidth: true })

    const plus = screen.getByRole('button', { name: 'Add a width' })
    await userEvent.click(plus)

    expect(plus).toHaveAttribute('aria-disabled', 'true')
    expect(plus).toHaveAccessibleDescription(/hugs its width/)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(sent).toEqual([])
  })
})
