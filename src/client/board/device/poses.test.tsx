import '../../styles.css'

import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'

import { createStructure } from '@/client/live/structure'
import type { Pose } from '@/shared/frame-device'
import { ringFocused } from '@/test/focus-ring'

import { PoseButtons } from './poses'

const REF = 'studio/home/inbox'

function server() {
  const sent: unknown[] = []
  const calls = createStructure(async (_url, init) => {
    sent.push(JSON.parse(String(init?.body)))
    return Response.json({ ok: true, data: [] })
  })
  return { calls, sent }
}

function Bar({
  pose,
  off,
  calls,
}: {
  pose: Pose
  off?: string
  calls: ReturnType<typeof server>['calls']
}) {
  return (
    <div className="absolute" style={{ left: 100, top: 100, width: 890 }}>
      <PoseButtons
        frameRef={REF}
        name="inbox"
        pose={pose}
        below={20}
        off={off}
        calls={calls}
      />
    </div>
  )
}

describe('PoseButtons', () => {
  afterEach(() => document.documentElement.classList.remove('dark'))

  it('names the group by its frame and presses the pose it is in', () => {
    const { calls } = server()

    render(<Bar pose="half" calls={calls} />)

    expect(screen.getByRole('group', { name: 'Pose of inbox' })).toBeVisible()
    expect(
      screen
        .getAllByRole('button')
        .map((button) => [
          button.textContent,
          button.getAttribute('aria-pressed'),
        ]),
    ).toEqual([
      ['Closed', 'false'],
      ['Half', 'true'],
      ['Open', 'false'],
    ])
  })

  it('folds the frame to the pose pressed', async () => {
    const { calls, sent } = server()
    render(<Bar pose="closed" calls={calls} />)

    await userEvent.click(screen.getByRole('button', { name: 'Open' }))

    expect(sent).toEqual([{ refs: [REF], pose: 'open' }])
  })

  it('writes nothing on the pose it is already in', async () => {
    const { calls, sent } = server()
    render(<Bar pose="open" calls={calls} />)

    await userEvent.click(screen.getByRole('button', { name: 'Open' }))

    expect(sent).toEqual([])
  })

  it('writes nothing while off, and says why on each button', async () => {
    const { calls, sent } = server()
    render(<Bar pose="closed" off="Unlock inbox to fold it" calls={calls} />)
    const open = screen.getByRole('button', { name: 'Open' })

    await userEvent.click(open)

    expect(sent).toEqual([])
    expect(open).toHaveAttribute('aria-disabled', 'true')
    expect(open).toHaveAttribute('title', 'Unlock inbox to fold it')
  })

  it('folds on Enter from a focused button', async () => {
    const { calls, sent } = server()
    render(<Bar pose="closed" calls={calls} />)
    screen.getByRole('button', { name: 'Half' }).focus()

    await userEvent.keyboard('{Enter}')

    expect(sent).toEqual([{ refs: [REF], pose: 'half' }])
  })

  it.each(['light', 'dark'])(
    'rings a focused button at 3:1 or more in %s',
    async (theme) => {
      document.documentElement.classList.toggle('dark', theme === 'dark')
      const { calls } = server()
      render(
        <div className="bg-background">
          <Bar pose="closed" calls={calls} />
        </div>,
      )

      const ring = await ringFocused(
        screen.getByRole('button', { name: 'Half' }),
      )

      expect(ring).toBeGreaterThanOrEqual(3)
    },
  )

  it('sits under the body, clear of it', () => {
    const { calls } = server()
    const { container } = render(<Bar pose="open" calls={calls} />)

    const bar = container.querySelector('[data-poses]')

    expect(bar?.getBoundingClientRect().top).toBeGreaterThanOrEqual(100 + 20)
  })
})
