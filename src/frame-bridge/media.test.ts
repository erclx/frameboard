import { afterEach, describe, expect, it } from 'vitest'

import { ask, bridgedFrame } from '@/test/frame-bridge'

const HASH = 'c'.repeat(64)
// The video's index past the injected style and script: html 0, head 1, body 2, video 3.
const VIDEO = { index: 3, hash: HASH }

let iframe: HTMLIFrameElement | undefined

afterEach(() => {
  iframe?.remove()
  iframe = undefined
})

async function frameOf(body: string): Promise<HTMLIFrameElement> {
  iframe = await bridgedFrame(body, { hash: HASH })
  return iframe
}

describe('media', () => {
  it('reads the media at an address as the page plays it', async () => {
    const frame = await frameOf('<video muted loop controls></video>')

    const asked = await ask(frame, 'media', VIDEO)
    asked.close()

    expect(asked.reply).toMatchObject({
      value: {
        tag: 'video',
        paused: true,
        muted: true,
        mutedInFile: true,
        controls: true,
        loop: true,
        autoplay: false,
      },
    })
  })

  it('pushes again on a playback change', async () => {
    const frame = await frameOf('<audio></audio>')
    const asked = await ask(frame, 'media', VIDEO)

    const audio = frame.contentDocument?.querySelector('audio')
    if (audio) audio.muted = true

    await expect
      .poll(() => asked.pushes.at(-1))
      .toMatchObject({ tag: 'audio', muted: true, mutedInFile: false })
    asked.close()
  })

  it('answers null for an address holding no media', async () => {
    const frame = await frameOf('<p>Words</p>')

    const asked = await ask(frame, 'media', VIDEO)

    expect(asked.reply).toEqual({ value: null })
  })
})

describe('media-act', () => {
  it('turns the live sound on, leaving the file as it was', async () => {
    const frame = await frameOf('<video muted></video>')

    const asked = await ask(frame, 'media-act', {
      ...VIDEO,
      act: { kind: 'toggle-sound' },
    })

    const video = frame.contentDocument?.querySelector('video')
    expect(asked.reply).toEqual({ value: true })
    expect(video?.muted).toBe(false)
    expect(video?.hasAttribute('muted')).toBe(true)
  })

  it('reaches no node at bytes the page no longer shows', async () => {
    const frame = await frameOf('<video muted></video>')

    const asked = await ask(frame, 'media-act', {
      index: 3,
      hash: 'e'.repeat(64),
      act: { kind: 'toggle-sound' },
    })

    expect(asked.reply).toEqual({ value: false })
    expect(frame.contentDocument?.querySelector('video')?.muted).toBe(true)
  })
})

describe('hide-strips', () => {
  it('hides the controls strip until closed, shifting no index', async () => {
    const frame = await frameOf('<video controls></video>')

    const asked = await ask(frame, 'hide-strips', {})
    const hidden = frame.contentDocument?.getElementById(
      'frameboard-media-strip',
    )
    const shown = await ask(frame, 'live-body', {})
    asked.close()
    await ask(frame, 'live-body', {})

    expect(hidden?.hasAttribute('data-frameboard')).toBe(true)
    expect(shown.reply).toEqual({ value: { index: 2, hash: HASH } })
    expect(
      frame.contentDocument?.getElementById('frameboard-media-strip'),
    ).toBeNull()
  })
})
