import '../../styles.css'

import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { Toaster } from '@/client/components/ui/toast'
import { createStructure } from '@/client/live/structure'
import type { FrameRecord, ProjectKitRecord } from '@/shared/records/list'
import { frameOf } from '@/test/board'

import { KitRow } from './kit-row'

const KITS: ProjectKitRecord[] = [
  { name: 'sketch', title: 'Sketch', frameCount: 1 },
  { name: 'wireframe', title: 'Wireframe', frameCount: 0 },
]

/** A structure whose kit write answers `answer`, recording each body sent. */
function kitCalls(
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
  frames: FrameRecord[],
  { kits = KITS, disabled = false, calls = kitCalls() } = {},
) {
  render(
    <>
      <Toaster />
      <KitRow
        frames={frames}
        kits={kits}
        disabled={disabled}
        calls={calls.calls}
      />
    </>,
  )
  return calls.sent
}

const trigger = () => screen.getByRole('button', { name: /^Kit/ })

async function pickItem(name: string) {
  await userEvent.click(trigger())
  const menu = await screen.findByRole('menu')
  await userEvent.click(within(menu).getByRole('menuitemradio', { name }))
}

describe('KitRow', () => {
  it("names one frame's kit by its title", () => {
    renderRow([frameOf('hero', { kit: 'sketch' })])

    expect(trigger()).toHaveAccessibleName('Kit Sketch')
  })

  it('offers None and the project kits alone', async () => {
    renderRow([frameOf('hero')])

    await userEvent.click(trigger())
    const menu = await screen.findByRole('menu')

    expect(
      within(menu)
        .getAllByRole('menuitemradio')
        .map((item) => item.textContent),
    ).toEqual(['None', 'Sketch', 'Wireframe'])
  })

  it('posts a pick for one frame', async () => {
    const sent = renderRow([frameOf('hero')])

    await pickItem('Wireframe')

    expect(sent).toEqual([{ refs: ['studio/home/hero'], kit: 'wireframe' }])
    expect(trigger()).toHaveAccessibleName('Kit Wireframe')
  })

  it('shows Mixed for frames on different kits and writes every frame in one post', async () => {
    const sent = renderRow([
      frameOf('hero', { kit: 'sketch' }),
      frameOf('pricing'),
    ])

    expect(trigger()).toHaveAccessibleName('Kit Mixed')
    await pickItem('Sketch')

    expect(sent).toEqual([
      { refs: ['studio/home/hero', 'studio/home/pricing'], kit: 'sketch' },
    ])
  })

  it('posts a null kit for None', async () => {
    const sent = renderRow([frameOf('hero', { kit: 'sketch' })])

    await pickItem('None')

    expect(sent).toEqual([{ refs: ['studio/home/hero'], kit: null }])
  })

  it('names a kit the project no longer holds as missing, and None clears it', async () => {
    const sent = renderRow([frameOf('hero', { kit: 'brand' })])

    expect(trigger()).toHaveAccessibleName('Kit brand (missing)')
    expect(
      screen.getByText('This project holds no kit brand. None takes it off.'),
    ).toBeInTheDocument()
    await pickItem('None')

    expect(sent).toEqual([{ refs: ['studio/home/hero'], kit: null }])
  })

  it('points at the Theme tab while the project holds no kit', () => {
    renderRow([frameOf('hero')], { kits: [] })

    expect(
      screen.getByText('Add a kit in the Theme tab to set one here.'),
    ).toBeInTheDocument()
  })

  it('disables the picker on a tab that may not write', () => {
    renderRow([frameOf('hero')], { disabled: true })

    expect(trigger()).toBeDisabled()
  })

  it('puts the stored kit back and raises the toast when the write is refused', async () => {
    renderRow([frameOf('hero', { kit: 'sketch' })], {
      calls: kitCalls(() =>
        Response.json(
          {
            ok: false,
            error: { code: 'kit-not-found', message: 'No kit wireframe.' },
          },
          { status: 404 },
        ),
      ),
    })

    await pickItem('Wireframe')

    expect(await screen.findByText('No kit wireframe.')).toBeInTheDocument()
    await waitFor(() => expect(trigger()).toHaveAccessibleName('Kit Sketch'))
  })
})
