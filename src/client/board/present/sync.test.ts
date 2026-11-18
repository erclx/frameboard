import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  type AudienceMessage,
  isPresenterPath,
  joinAudience,
  presentationIdOf,
  type PresentedState,
  presenterUrl,
  serveAudience,
} from './sync'

function presented(patch: Partial<PresentedState> = {}): PresentedState {
  return {
    page: 'webapp/home',
    frame: 'webapp/home/hero',
    step: 0,
    startedAt: 1_000,
    themes: { 'webapp/home/hero': 'light' },
    ...patch,
  }
}

const closers: (() => void)[] = []

afterEach(() => {
  for (const close of closers.splice(0)) close()
})

/** The channel a stranger on the same name posts through, as a third tab would. */
function stranger(id: string): BroadcastChannel {
  const channel = new BroadcastChannel(`frameboard.present.${id}`)
  closers.push(() => channel.close())
  return channel
}

function audience(
  id: string,
  current: PresentedState | null = presented(),
): {
  step: ReturnType<typeof vi.fn<(by: 1 | -1) => void>>
  leave: ReturnType<typeof vi.fn<() => void>>
  send: (state: PresentedState) => void
  end: () => void
} {
  const step = vi.fn<(by: 1 | -1) => void>()
  const leave = vi.fn<() => void>()
  const served = serveAudience(id, { current: () => current, step, leave })
  closers.push(() => served.end())
  return { step, leave, ...served }
}

function presenter(id: string) {
  const received: AudienceMessage[] = []
  const link = joinAudience(id, (message) => received.push(message))
  closers.push(() => link.close())
  return { received, ...link }
}

describe('the presenter window joining', () => {
  it('is answered with the state the audience presents', async () => {
    audience('one', presented({ step: 2 }))

    const { received } = presenter('one')

    await expect
      .poll(() => received)
      .toEqual([{ type: 'state', ...presented({ step: 2 }) }])
  })

  it('hears nothing from an audience not yet presenting', async () => {
    audience('one', null)

    const { received } = presenter('one')
    stranger('one').postMessage({ type: 'ended' })

    await expect.poll(() => received).toEqual([{ type: 'ended' }])
  })

  it('hears only its own presentation', async () => {
    audience('other', presented({ frame: 'webapp/home/about' }))
    audience('one')

    const { received } = presenter('one')

    await expect
      .poll(() => received)
      .toEqual([{ type: 'state', ...presented() }])
  })
})

describe('the audience sending', () => {
  it('passes each state on', async () => {
    const { send } = audience('one', null)
    const { received } = presenter('one')

    send(presented({ frame: 'webapp/home/about', step: 1 }))

    await expect
      .poll(() => received)
      .toEqual([
        {
          type: 'state',
          ...presented({ frame: 'webapp/home/about', step: 1 }),
        },
      ])
  })

  it('says presenting ended on leaving', async () => {
    const { end } = audience('one', null)
    const { received } = presenter('one')

    end()

    await expect.poll(() => received).toEqual([{ type: 'ended' }])
  })
})

describe('the presenter window commanding', () => {
  it('steps the audience either way', async () => {
    const { step } = audience('one')
    const link = presenter('one')

    link.step(1)
    link.step(-1)

    await expect.poll(() => step.mock.calls).toEqual([[1], [-1]])
  })

  it('leaves presenting', async () => {
    const { leave } = audience('one')

    presenter('one').leave()

    await expect.poll(() => leave.mock.calls.length).toBe(1)
  })
})

describe('a message of another shape', () => {
  it('never reaches the audience', async () => {
    const { step, leave } = audience('one')
    const channel = stranger('one')

    channel.postMessage({ type: 'step', by: 2 })
    channel.postMessage({ type: 'ended' })
    channel.postMessage('leave')
    channel.postMessage({ type: 'step', by: -1 })

    await expect.poll(() => step.mock.calls).toEqual([[-1]])
    expect(leave).not.toHaveBeenCalled()
  })

  it('never reaches the presenter window', async () => {
    const { received } = presenter('one')
    const channel = stranger('one')

    channel.postMessage({ type: 'state', page: 'webapp/home' })
    channel.postMessage({ ...presented(), type: 'state', step: -1 })
    channel.postMessage({ type: 'step', by: 1 })
    channel.postMessage({ type: 'ended' })

    await expect.poll(() => received).toEqual([{ type: 'ended' }])
  })
})

describe('the presenter address', () => {
  it('sits under the page and carries the presentation', () => {
    expect(presenterUrl('web app', 'home', 'ab-12')).toBe(
      '/p/web%20app/home/presenter?id=ab-12',
    )
  })

  it('is told apart from the page it sits under', () => {
    expect(isPresenterPath('/p/web%20app/home/presenter')).toBe(true)
    expect(isPresenterPath('/p/web%20app/home')).toBe(false)
    expect(isPresenterPath('/p/presenter/presenter')).toBe(false)
  })

  it('reads the presentation back', () => {
    expect(presentationIdOf('?id=ab-12')).toBe('ab-12')
  })

  it('reads no presentation from a missing or malformed id', () => {
    expect(presentationIdOf('')).toBeNull()
    expect(presentationIdOf('?id=../x')).toBeNull()
  })
})
