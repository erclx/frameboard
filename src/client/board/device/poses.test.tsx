import '../../styles.css'

import { render, screen } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createStructure } from '@/client/live/structure'
import type { Pose, Turn } from '@/shared/frame-device'
import { ringFocused } from '@/test/focus-ring'

import type { Box } from '../geometry/box'
import { attachCanvas } from '../view'
import { PoseButtons, RotateButtons } from './poses'
import { turnRefusal } from './turn'

const REF = 'studio/home/inbox'

/** A server answering each fold with the frame at `box`, the box the pose sets. */
function server(box: Box = { x: 0, y: 0, width: 466, height: 900 }) {
  const sent: unknown[] = []
  const calls = createStructure(async (_url, init) => {
    sent.push(JSON.parse(String(init?.body)))
    return Response.json({ ok: true, data: [{ ref: REF, box }] })
  })
  return { calls, sent }
}

const detaches: (() => void)[] = []

/** A canvas showing 800 by 600 from the origin, recording each travel. */
function attachView() {
  const centered: Box[] = []
  detaches.push(
    attachCanvas(
      {
        zoomBy: () => {},
        zoomTo: () => {},
        fit: () => {},
        fitTo: () => {},
        panBy: () => {},
        centerOn: (box) => centered.push(box),
        visible: () => ({ x: 0, y: 0, width: 800, height: 600 }),
      },
      'studio/home',
    ),
  )
  return { centered }
}

function Bar({
  pose,
  off,
  rotate,
  calls,
}: {
  pose: Pose
  off?: string
  rotate?: { turn?: Turn; off?: string }
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
        rotate={rotate}
        calls={calls}
      />
    </div>
  )
}

describe('PoseButtons', () => {
  afterEach(() => {
    document.documentElement.classList.remove('dark')
    for (const detach of detaches.splice(0)) detach()
  })

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

  describe('bringing the frame into view', () => {
    it('centers the box a pose grew past the view', async () => {
      const view = attachView()
      const grown = { x: 300, y: 0, width: 600, height: 400 }
      const { calls } = server(grown)
      render(<Bar pose="closed" calls={calls} />)

      await userEvent.click(screen.getByRole('button', { name: 'Open' }))

      await vi.waitFor(() => expect(view.centered).toEqual([grown]))
    })

    it('leaves the view on a box still wholly in it', async () => {
      const view = attachView()
      const inside = { x: 100, y: 100, width: 400, height: 300 }
      const { calls, sent } = server(inside)
      render(<Bar pose="closed" calls={calls} />)

      await userEvent.click(screen.getByRole('button', { name: 'Open' }))

      await vi.waitFor(() => expect(sent).toHaveLength(1))
      expect(view.centered).toEqual([])
    })

    it('leaves the view on a box larger than it', async () => {
      const view = attachView()
      const huge = { x: 300, y: 0, width: 1200, height: 400 }
      const { calls, sent } = server(huge)
      render(<Bar pose="closed" calls={calls} />)

      await userEvent.click(screen.getByRole('button', { name: 'Open' }))

      await vi.waitFor(() => expect(sent).toHaveLength(1))
      expect(view.centered).toEqual([])
    })
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

describe('PoseButtons with Rotate', () => {
  afterEach(() => {
    for (const detach of detaches.splice(0)) detach()
  })

  it('shows the poses, a divider, then Rotate in one group', () => {
    const { calls } = server()

    render(<Bar pose="open" rotate={{}} calls={calls} />)

    const group = screen.getByRole('group', { name: 'Pose of inbox' })
    expect(
      [...group.querySelectorAll('button, [data-bar-divider]')].map(
        (part) => part.textContent || 'divider',
      ),
    ).toEqual(['Closed', 'Half', 'Open', 'divider', 'Rotate'])
  })

  it.each([
    [undefined, 'left'],
    ['left', 'right'],
    ['right', 'upright'],
  ] as const)(
    'turns a foldable held %s on to %s, sending the target turn',
    async (turn, next) => {
      attachView()
      const { calls, sent } = server()
      render(<Bar pose="closed" rotate={{ turn }} calls={calls} />)

      await userEvent.click(screen.getByRole('button', { name: 'Rotate' }))

      expect(sent).toEqual([{ refs: [REF], turn: next }])
    },
  )

  it('turns Rotate off alone, saying why, while the poses stay on', async () => {
    const { calls, sent } = server()
    render(
      <Bar
        pose="closed"
        rotate={{ off: 'Unlock inbox to turn it' }}
        calls={calls}
      />,
    )
    const rotate = screen.getByRole('button', { name: 'Rotate' })

    await userEvent.click(rotate)

    expect(sent).toEqual([])
    expect(rotate).toHaveAttribute('title', 'Unlock inbox to turn it')
    expect(screen.getByRole('button', { name: /Open/ })).not.toHaveAttribute(
      'aria-disabled',
    )
  })
})

describe('RotateButtons', () => {
  afterEach(() => {
    for (const detach of detaches.splice(0)) detach()
  })

  function Rotate({
    turn,
    off,
    calls,
  }: {
    turn?: Turn
    off?: string
    calls: ReturnType<typeof server>['calls']
  }) {
    return (
      <div className="absolute" style={{ left: 100, top: 100, width: 390 }}>
        <RotateButtons
          frameRef={REF}
          name="inbox"
          turn={turn}
          below={20}
          off={off}
          calls={calls}
        />
      </div>
    )
  }

  it('names the group by its frame and shows Rotate alone', () => {
    const { calls } = server()

    render(<Rotate calls={calls} />)

    expect(screen.getByRole('group', { name: 'Turn of inbox' })).toBeVisible()
    expect(
      screen.getAllByRole('button').map((button) => button.textContent),
    ).toEqual(['Rotate'])
  })

  it.each([
    [undefined, 'left'],
    ['left', 'right'],
    ['right', 'upright'],
  ] as const)(
    'turns a frame held %s on to %s, sending the target turn',
    async (turn, next) => {
      attachView()
      const { calls, sent } = server()
      render(<Rotate turn={turn} calls={calls} />)

      await userEvent.click(screen.getByRole('button', { name: 'Rotate' }))

      expect(sent).toEqual([{ refs: [REF], turn: next }])
    },
  )

  it('writes nothing while off, and says why', async () => {
    const { calls, sent } = server()
    render(<Rotate off="Unlock inbox to turn it" calls={calls} />)
    const rotate = screen.getByRole('button', { name: 'Rotate' })

    await userEvent.click(rotate)

    expect(sent).toEqual([])
    expect(rotate).toHaveAttribute('aria-disabled', 'true')
    expect(rotate).toHaveAttribute('title', 'Unlock inbox to turn it')
  })

  it.each([
    ['a locked frame', { locked: true, widths: [] }, 'Unlock inbox'],
    [
      'a frame holding extra widths',
      { locked: false, widths: [{ width: 430, height: 932 }] },
      'Clear the extra widths',
    ],
  ])('turns %s off, naming why', (_label, flags, reason) => {
    expect(turnRefusal({ name: 'inbox', ...flags })).toContain(reason)
  })

  it('leaves a free frame on', () => {
    expect(
      turnRefusal({ name: 'inbox', locked: false, widths: [] }),
    ).toBeUndefined()
  })
})
