import '../../styles.css'

import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { AssetFile } from '@/shared/records/assets'

import CLIP from '../../../../test/fixtures/boards/basic/marketing/assets/clip.webm?url'
import { Thumbnail } from './tile'

const VIDEO: AssetFile = { path: 'clip.webm', kind: 'video', size: 14_000 }

/** A one second VP8 clip, 160 by 90. */
function renderVideo(url: string, playing = false) {
  return render(
    <Thumbnail project="studio" file={VIDEO} url={url} playing={playing} />,
  )
}

function videoOf(container: HTMLElement): HTMLVideoElement {
  const video = container.querySelector('video')
  if (!video) throw new Error('the tile draws no video')
  return video
}

describe('Thumbnail for a video', () => {
  it('shows the first frame with the length once its metadata loads', async () => {
    const { container } = renderVideo(CLIP)

    expect(await screen.findByText('0:01')).toBeInTheDocument()
    expect(videoOf(container).videoWidth).toBe(160)
    expect(videoOf(container).paused).toBe(true)
  })

  it('loads metadata alone until its tile is hovered or focused', () => {
    const { container } = renderVideo(CLIP)

    expect(videoOf(container).preload).toBe('metadata')
  })

  it('plays muted while its tile is hovered or focused', async () => {
    const { container, rerender } = renderVideo(CLIP)
    await screen.findByText('0:01')

    rerender(
      <Thumbnail project="studio" file={VIDEO} url={CLIP} playing={true} />,
    )

    await waitFor(() => expect(videoOf(container).paused).toBe(false))
    expect(videoOf(container).muted).toBe(true)
  })

  it('pauses and rewinds once its tile is left', async () => {
    const { container, rerender } = renderVideo(CLIP, true)
    await waitFor(() => expect(videoOf(container).paused).toBe(false))

    rerender(<Thumbnail project="studio" file={VIDEO} url={CLIP} />)

    await waitFor(() => expect(videoOf(container).paused).toBe(true))
    expect(videoOf(container).currentTime).toBe(0)
  })

  it('says the codec cannot play when the file does not decode', async () => {
    const { container } = renderVideo('data:video/mp4,not-a-video')

    expect(await screen.findByText("Can't play this codec")).toBeInTheDocument()
    expect(container.querySelector('video')).toBeNull()
  })
})
