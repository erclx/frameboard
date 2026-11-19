import '../../styles.css'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { liveStore } from '@/client/live/store'
import { createStructure } from '@/client/live/structure'
import { frameOf } from '@/test/board'

import { FrameSection } from './frame-section'

const PAGE = 'studio/home'
const SWATCHES = frameOf('swatches', {
  name: 'Color swatches',
  box: { x: 460, y: 116, width: 640, height: 188 },
})

const ok = () => Response.json({ ok: true, data: [] })

/** A structure whose device write answers, recording each body sent. */
function deviceCalls() {
  const sent: unknown[] = []
  const calls = createStructure(async (_path, init) => {
    sent.push(JSON.parse(String(init?.body)))
    return ok()
  })
  return { sent, calls }
}

const shownAt = (width: number) => ({
  ...SWATCHES,
  box: { ...SWATCHES.box, width },
  showDevice: true as const,
})

describe('the island in the Show device menu', () => {
  beforeEach(() => {
    liveStore.setState({ canWrite: true })
  })

  it('picks the wide island for a phone', async () => {
    const { sent, calls } = deviceCalls()
    render(<FrameSection page={PAGE} frames={[shownAt(390)]} calls={calls} />)

    await userEvent.click(screen.getByRole('button', { name: 'Phone device' }))
    expect(
      await screen.findByRole('menuitemradio', { name: 'Compact island' }),
    ).toBeChecked()
    await userEvent.click(
      screen.getByRole('menuitemradio', { name: 'Wide island' }),
    )

    expect(sent).toEqual([{ refs: [SWATCHES.ref], island: 'wide' }])
  })

  it('names a turned phone a phone and offers its island, its box landscape', async () => {
    const turned = {
      ...shownAt(844),
      box: { ...SWATCHES.box, width: 844, height: 390 },
      device: 'phone' as const,
      turn: 'left' as const,
    }
    render(<FrameSection page={PAGE} frames={[turned]} />)

    await userEvent.click(screen.getByRole('button', { name: 'Phone device' }))

    expect(
      await screen.findByRole('menuitemradio', { name: 'Compact island' }),
    ).toBeChecked()
  })

  it('reads a picked wide island as checked', async () => {
    render(
      <FrameSection
        page={PAGE}
        frames={[{ ...shownAt(390), island: 'wide' as const }]}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Phone device' }))

    expect(
      await screen.findByRole('menuitemradio', { name: 'Wide island' }),
    ).toBeChecked()
  })

  it('offers no island for a tablet or a foldable', async () => {
    const folded = {
      ...shownAt(890),
      device: 'foldable' as const,
      pose: 'open' as const,
    }
    render(<FrameSection page={PAGE} frames={[shownAt(640), folded]} />)

    await userEvent.click(screen.getByRole('button', { name: 'Mixed device' }))
    await screen.findByRole('menuitemradio', { name: 'Foldable' })

    expect(
      screen.queryByRole('menuitemradio', { name: 'Wide island' }),
    ).not.toBeInTheDocument()
  })
})
