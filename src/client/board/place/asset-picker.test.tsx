import '../../styles.css'

import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { liveStore } from '@/client/live/store'
import type { AssetAddResult, AssetFile } from '@/shared/records/assets'

import { modeStore } from '../mode'
import { AssetPicker } from './asset-picker'
import { armedStore, pickerStore } from './tool'

const FILES: AssetFile[] = [
  { path: 'hero.png', kind: 'image', size: 1_200_000 },
  { path: 'loader.gif', kind: 'gif', size: 240_000 },
  { path: 'logo.svg', kind: 'svg', size: 2_000 },
  { path: 'demo.mp4', kind: 'video', size: 4_100_000 },
  { path: 'Inter.woff2', kind: 'font', size: 98_000 },
  { path: 'shared.css', kind: 'stylesheet', size: 3_000 },
  { path: 'theme.mp3', kind: 'audio', size: 500_000 },
]

function listing(files: AssetFile[]) {
  return async () => ({ files })
}

function renderPicker(
  files: AssetFile[],
  upload?: (project: string, files: File[]) => Promise<AssetAddResult>,
) {
  return render(
    <AssetPicker
      project="studio"
      anchor={createRef()}
      load={listing(files)}
      upload={upload}
    />,
  )
}

beforeEach(() => {
  act(() => {
    liveStore.setState({ canWrite: true })
    pickerStore.setState({ open: true })
  })
})

afterEach(() => {
  act(() => {
    liveStore.setState({ canWrite: false })
    pickerStore.setState({ open: false })
    armedStore.setState({ file: null })
    modeStore.setState({ tool: 'move', mode: 'edit' })
  })
})

describe('AssetPicker', () => {
  it('lists the images, GIFs, SVGs, and videos and leaves out every other kind', async () => {
    renderPicker(FILES)

    expect(
      await screen.findByRole('button', { name: 'Place hero.png' }),
    ).toBeInTheDocument()
    expect(
      screen
        .getAllByRole('button', { name: /^Place / })
        .map((tile) => tile.getAttribute('aria-label')),
    ).toEqual([
      'Place hero.png',
      'Place loader.gif',
      'Place logo.svg',
      'Place demo.mp4',
    ])
  })

  it('arms the Image tool with the file chosen and closes', async () => {
    renderPicker(FILES)

    await userEvent.click(
      await screen.findByRole('button', { name: 'Place demo.mp4' }),
    )

    expect(armedStore.getState().file).toEqual({
      project: 'studio',
      path: 'demo.mp4',
      kind: 'video',
    })
    expect(modeStore.getState().tool).toBe('image')
    expect(pickerStore.getState().open).toBe(false)
  })

  it('offers Add files when the project has no image or video, posting what is chosen', async () => {
    const posted: string[] = []
    renderPicker(FILES.slice(4), async (_project, files) => {
      posted.push(...files.map((file) => file.name))
      return { added: [], refused: [] }
    })

    expect(
      await screen.findByText(/No images or videos in/),
    ).toBeInTheDocument()
    await userEvent.upload(
      screen.getByLabelText('Choose files to add'),
      new File(['x'], 'hero.png', { type: 'image/png' }),
    )

    await waitFor(() => expect(posted).toEqual(['hero.png']))
  })

  it('stays closed on a read-only tab', async () => {
    act(() => liveStore.setState({ canWrite: false }))

    renderPicker(FILES)

    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('shows itself as a dialog while open on a tab that may write', async () => {
    renderPicker(FILES)

    expect(
      await screen.findByRole('dialog', { name: 'Image or video' }),
    ).toBeInTheDocument()
  })
})
