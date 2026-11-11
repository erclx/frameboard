import '../../../styles.css'

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { LOOK_MARKER, RENDERED_HASH } from '@/shared/theme'
import { realClick } from '@/test/real-pointer'

import CLIP from '../../../../../test/fixtures/boards/basic/marketing/assets/clip.webm?url'
import { useLiveMedia } from '../../element/media'
import type { ElementKey } from '../../selection'
import { VideoSection } from './video'
import type { ElementChange } from './write'

const FRAME = 'studio/home/hero'
const HASH = 'a'.repeat(64)
/** The video's index, after html, head, and body, the injected style skipped. */
const VIDEO: ElementKey = { frame: FRAME, index: 3, hash: HASH }

let root: HTMLElement | null = null

afterEach(() => {
  root?.remove()
  root = null
})

/** Mounts a live frame box whose page holds `media`, as the canvas draws one. */
async function mountFrame(media: string): Promise<HTMLIFrameElement> {
  root = document.createElement('div')
  root.dataset.frame = FRAME
  const iframe = document.createElement('iframe')
  root.append(iframe)
  document.body.append(root)
  await new Promise<void>((resolve) => {
    iframe.addEventListener('load', () => resolve(), { once: true })
    iframe.srcdoc = `<!doctype html><html><head><style ${LOOK_MARKER} ${RENDERED_HASH}="${HASH}"></style></head><body>${media}</body></html>`
  })
  return iframe
}

function liveVideo(iframe: HTMLIFrameElement): HTMLVideoElement {
  const video = iframe.contentDocument?.querySelector('video')
  if (!video) throw new Error('the frame holds no video')
  return video
}

function Section({ write }: { write: (change: ElementChange) => void }) {
  const media = useLiveMedia(VIDEO)
  return media ? (
    <VideoSection
      media={media}
      disabled={false}
      write={async (change) => {
        write(change)
        return true
      }}
    />
  ) : null
}

describe('VideoSection', () => {
  it('plays and pauses the live video, writing nothing', async () => {
    const iframe = await mountFrame(`<video src="${CLIP}" loop></video>`)
    const write = vi.fn()
    render(<Section write={write} />)

    // A real press, since the page plays with sound only on a user's activation.
    await realClick(await screen.findByRole('button', { name: 'Play' }))
    await waitFor(() => expect(liveVideo(iframe).paused).toBe(false))
    await realClick(screen.getByRole('button', { name: 'Pause' }))

    await waitFor(() => expect(liveVideo(iframe).paused).toBe(true))
    expect(write).not.toHaveBeenCalled()
  })

  it('scrubs the live video from the track, writing nothing', async () => {
    const iframe = await mountFrame(`<video src="${CLIP}"></video>`)
    const write = vi.fn()
    render(<Section write={write} />)
    const track = await screen.findByRole('slider', { name: 'Position' })
    await waitFor(() => expect(track).toBeEnabled())

    // A real press on the track's middle, since user-event cannot drive a range.
    await realClick(track)

    await waitFor(() =>
      expect(liveVideo(iframe).currentTime).toBeGreaterThan(0.2),
    )
    expect(write).not.toHaveBeenCalled()
  })

  it('turns the live sound on without touching the file', async () => {
    const iframe = await mountFrame(`<video src="${CLIP}" muted></video>`)
    const write = vi.fn()
    render(<Section write={write} />)

    await userEvent.click(
      await screen.findByRole('button', { name: 'Sound on' }),
    )

    expect(liveVideo(iframe).muted).toBe(false)
    expect(liveVideo(iframe).hasAttribute('muted')).toBe(true)
    expect(write).not.toHaveBeenCalled()
  })

  it('drops muted from the file when Muted in the file turns off', async () => {
    await mountFrame(`<video src="${CLIP}" muted></video>`)
    const write = vi.fn()
    render(<Section write={write} />)

    await userEvent.click(
      await screen.findByRole('switch', { name: 'Muted in the file' }),
    )

    expect(write).toHaveBeenCalledWith({
      kind: 'attribute',
      name: 'muted',
      remove: true,
    })
  })

  it('writes muted into the file when Muted in the file turns on', async () => {
    await mountFrame(`<video src="${CLIP}"></video>`)
    const write = vi.fn()
    render(<Section write={write} />)

    await userEvent.click(
      await screen.findByRole('switch', { name: 'Muted in the file' }),
    )

    expect(write).toHaveBeenCalledWith({
      kind: 'attribute',
      name: 'muted',
      value: '',
    })
  })

  it('says the codec cannot play in place of a dead track', async () => {
    await mountFrame('<video src="data:video/mp4,not-a-video"></video>')
    render(<Section write={vi.fn()} />)

    expect(await screen.findByText("Can't play this codec")).toBeInTheDocument()
    expect(screen.queryByRole('slider')).toBeNull()
  })

  it('names an audio element Audio', async () => {
    await mountFrame(`<audio src="${CLIP}" controls></audio>`)
    render(<Section write={vi.fn()} />)

    expect(
      await screen.findByRole('heading', { name: 'Audio' }),
    ).toBeInTheDocument()
  })

  it('lets go of the element once its frame turns to a placeholder', async () => {
    const iframe = await mountFrame(`<video src="${CLIP}"></video>`)
    render(<Section write={vi.fn()} />)
    await screen.findByRole('heading', { name: 'Video' })

    iframe.replaceWith(document.createElement('div'))

    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Video' })).toBeNull(),
    )
  })
})
