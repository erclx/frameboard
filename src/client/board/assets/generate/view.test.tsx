import '../../../styles.css'

import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { liveStore } from '@/client/live/store'
import { BoardWriteError } from '@/client/live/write'
import type { ImageGenerate, ImageOffer } from '@/shared/records/sourcing'

import { resetRuns } from './run-store'
import { GenerateView } from './view'

function offer(overrides: Partial<ImageOffer> = {}): ImageOffer {
  return {
    version: 1,
    provider: {
      name: 'fal',
      model: 'fal-ai/flux/schnell',
      key: 'FAL_KEY',
      width: 1024,
      height: 1024,
      priceUsd: 0.0032,
    },
    keys: ['FAL_KEY', 'GEMINI_API_KEY'],
    ...overrides,
  }
}

function generated(path: string): ImageGenerate {
  return {
    version: 1,
    provider: 'fal',
    model: 'fal-ai/flux/schnell',
    prompt: 'a house at dusk',
    width: 1024,
    height: 1024,
    priceUsd: 0.0032,
    dryRun: false,
    saved: {
      version: 1,
      project: 'webapp',
      path,
      licensePath: `${path}.license.json`,
      license: {
        version: 1,
        origin: 'generated',
        provider: 'fal',
        model: 'fal-ai/flux/schnell',
        prompt: 'a house at dusk',
        width: 1024,
        height: 1024,
        priceUsd: 0.0032,
        savedAt: '2026-11-18T12:00:00.000Z',
      },
    },
  }
}

async function describeImage(text: string) {
  const user = userEvent.setup()
  await user.type(
    await screen.findByRole('textbox', { name: 'Describe the image' }),
    text,
  )
  return user
}

beforeEach(() => {
  act(() => liveStore.setState({ canWrite: true }))
})

afterEach(() => {
  act(resetRuns)
})

describe('GenerateView', () => {
  it('shows the provider and its price before anything runs', async () => {
    const generate = vi.fn()
    render(
      <GenerateView
        project="webapp"
        load={async () => offer()}
        generate={generate}
      />,
    )

    expect(
      await screen.findByText('fal-ai/flux/schnell on fal'),
    ).toBeInTheDocument()
    expect(screen.getByText('about $0.0032 an image')).toBeInTheDocument()
    expect(screen.getByText(/The bill is yours/)).toHaveTextContent('FAL_KEY')
    expect(generate).not.toHaveBeenCalled()
  })

  it('says which keys to set and sends nothing when no provider is set up', async () => {
    const generate = vi.fn()
    render(
      <GenerateView
        project="webapp"
        load={async () => offer({ provider: null })}
        generate={generate}
      />,
    )
    const user = await describeImage('a house')

    await user.click(screen.getByRole('button', { name: 'Generate' }))

    expect(screen.getByText('No provider set up')).toBeInTheDocument()
    expect(screen.getByText(/where the board was started/)).toHaveTextContent(
      'Set FAL_KEY or GEMINI_API_KEY where the board was started.',
    )
    expect(generate).not.toHaveBeenCalled()
  })

  it('sends one request however often Generate is pressed, holding the button while it runs', async () => {
    let land = (_: ImageGenerate) => {}
    const generate = vi.fn(
      () => new Promise<ImageGenerate>((done) => (land = done)),
    )
    render(
      <GenerateView
        project="webapp"
        load={async () => offer()}
        generate={generate}
      />,
    )
    const user = await describeImage('a house at dusk')

    await user.click(screen.getByRole('button', { name: 'Generate' }))
    await user.click(screen.getByRole('button', { name: 'Generating' }))

    expect(screen.getByRole('button', { name: 'Generating' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(screen.getByRole('list', { name: 'Generating' })).toBeInTheDocument()
    act(() => land(generated('a-house-at-dusk.png')))
    expect(
      await screen.findByRole('heading', { name: 'a-house-at-dusk.png' }),
    ).toBeVisible()
    expect(generate).toHaveBeenCalledTimes(1)
    expect(generate).toHaveBeenCalledWith('webapp', 'a house at dusk')
  })

  it('names what the provider answered and gives the button back', async () => {
    render(
      <GenerateView
        project="webapp"
        load={async () => offer()}
        generate={() =>
          Promise.reject(
            new BoardWriteError(
              'provider-failed',
              'fal answered 402: payment required',
            ),
          )
        }
      />,
    )
    const user = await describeImage('a house')

    await user.click(screen.getByRole('button', { name: 'Generate' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'fal answered 402: payment required Check the account behind FAL_KEY, then generate again.',
    )
    expect(screen.getByRole('button', { name: 'Generate' })).toBeEnabled()
  })

  it('paints the failure line in the destructive color', async () => {
    render(
      <GenerateView
        project="webapp"
        load={async () => offer()}
        generate={() =>
          Promise.reject(new BoardWriteError('provider-failed', 'refused'))
        }
      />,
    )
    const destructive = document.createElement('span')
    destructive.className = 'text-destructive'
    document.body.append(destructive)
    const user = await describeImage('a house')

    await user.click(screen.getByRole('button', { name: 'Generate' }))

    expect(getComputedStyle(await screen.findByRole('alert')).color).toBe(
      getComputedStyle(destructive).color,
    )
    destructive.remove()
  })

  it('keeps Generate off in a read-only tab and says why', async () => {
    act(() => liveStore.setState({ canWrite: false }))
    const generate = vi.fn()
    render(
      <GenerateView
        project="webapp"
        load={async () => offer()}
        generate={generate}
      />,
    )

    const user = await describeImage('a house')
    await user.click(screen.getByRole('button', { name: 'Generate' }))

    expect(screen.getByText(/nothing can be generated/)).toBeVisible()
    expect(generate).not.toHaveBeenCalled()
  })

  describe('after the dialog closed', () => {
    it('keeps a run going and holds Generate, sending nothing more', async () => {
      const generate = vi.fn(() => new Promise<ImageGenerate>(() => {}))
      const view = (
        <GenerateView
          project="webapp"
          load={async () => offer()}
          generate={generate}
        />
      )
      const first = render(view)
      const user = await describeImage('a house at dusk')
      await user.click(screen.getByRole('button', { name: 'Generate' }))

      first.unmount()
      render(view)
      await user.click(
        await screen.findByRole('button', { name: 'Generating' }),
      )

      expect(
        screen.getByRole('textbox', { name: 'Describe the image' }),
      ).toHaveValue('a house at dusk')
      expect(generate).toHaveBeenCalledTimes(1)
    })

    it('shows the picture a run landed while it was closed', async () => {
      let land = (_: ImageGenerate) => {}
      const view = (
        <GenerateView
          project="webapp"
          load={async () => offer()}
          generate={() => new Promise((done) => (land = done))}
        />
      )
      const first = render(view)
      const user = await describeImage('a house at dusk')
      await user.click(screen.getByRole('button', { name: 'Generate' }))

      first.unmount()
      await act(async () => land(generated('a-house-at-dusk.png')))
      render(view)

      expect(
        screen.getByRole('heading', { name: 'a-house-at-dusk.png' }),
      ).toBeVisible()
    })

    it('shows why a run failed while it was closed', async () => {
      let fail = (_: Error) => {}
      const view = (
        <GenerateView
          project="webapp"
          load={async () => offer()}
          generate={() => new Promise((_, refuse) => (fail = refuse))}
        />
      )
      const first = render(view)
      const user = await describeImage('a house at dusk')
      await user.click(screen.getByRole('button', { name: 'Generate' }))

      first.unmount()
      await act(async () => fail(new Error('fal answered 402')))
      render(view)

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'fal answered 402',
      )
    })

    it('starts another project with no prompt and no picture', async () => {
      const first = render(
        <GenerateView
          project="webapp"
          load={async () => offer()}
          generate={async () => generated('a-house-at-dusk.png')}
        />,
      )
      const user = await describeImage('a house at dusk')
      await user.click(screen.getByRole('button', { name: 'Generate' }))
      await screen.findByRole('heading', { name: 'a-house-at-dusk.png' })

      first.unmount()
      render(<GenerateView project="mobile" load={async () => offer()} />)

      expect(
        screen.getByRole('textbox', { name: 'Describe the image' }),
      ).toHaveValue('')
      expect(screen.queryByRole('heading')).not.toBeInTheDocument()
    })
  })

  it('previews the newest picture, and an earlier one once it is picked', async () => {
    const generate = vi
      .fn()
      .mockResolvedValueOnce(generated('a-house.png'))
      .mockResolvedValueOnce(generated('a-house-2.png'))
    render(
      <GenerateView
        project="webapp"
        load={async () => offer()}
        generate={generate}
      />,
    )
    const user = await describeImage('a house')
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    await screen.findByRole('heading', { name: 'a-house.png' })
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    await screen.findByRole('heading', { name: 'a-house-2.png' })

    await user.click(screen.getByRole('button', { name: /a-house\.png/ }))

    expect(screen.getByRole('heading', { name: 'a-house.png' })).toBeVisible()
  })

  it('asks for the image again when a deleted picture’s name is taken', async () => {
    const asked = () =>
      new Set(
        performance
          .getEntriesByType('resource')
          .map((entry) => entry.name)
          .filter((name) => name.includes('retaken.png')),
      ).size
    render(
      <GenerateView
        project="webapp"
        load={async () => offer()}
        generate={async () => generated('retaken.png')}
      />,
    )
    const user = await describeImage('a house')
    await user.click(screen.getByRole('button', { name: 'Generate' }))
    await waitFor(() => expect(asked()).toBe(1))

    await user.click(screen.getByRole('button', { name: 'Generate' }))

    await waitFor(() => expect(asked()).toBe(2))
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
  })

  it('names the file type of a picture no longer in assets', async () => {
    render(
      <GenerateView
        project="webapp"
        load={async () => offer()}
        generate={async () => generated('gone.png')}
      />,
    )
    const user = await describeImage('a house')

    await user.click(screen.getByRole('button', { name: 'Generate' }))

    const tile = await screen.findByRole('listitem')
    await waitFor(() => expect(tile).toHaveTextContent('No longer in assets/'))
  })
})
