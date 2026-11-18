import { afterEach, describe, expect, it } from 'vitest'

import type { ModelReading } from '@/shared/frame-bridge/model'
import { ask, type Asked, bridgedFrame } from '@/test/frame-bridge'

const HASH = 'c'.repeat(64)
// Past the injected style and script: html 0, head 1, body 2, the viewer 3.
const BARE = { index: 3, hash: HASH }
// The viewer's own script counts as the file's: html 0, head 1, script 2, body 3, the viewer 4.
const DRAWN = { index: 4, hash: HASH }

const SCRIPT =
  '<script type="module" src="/node_modules/@google/model-viewer/dist/model-viewer.min.js"></script>'

/** A viewer on `spin.glb`, which carries one clip named Spin. */
const spinning = (attributes = '') =>
  `<model-viewer src="/test/fixtures/models/spin.glb" ${attributes} style="display:block;width:200px;height:160px"></model-viewer>`

/** The reading the frame last sent, its reply until it pushes. */
function latest(asked: Asked<'model'>): ModelReading | null {
  const pushed = asked.pushes.at(-1)
  if (pushed !== undefined) return pushed
  return 'value' in asked.reply ? asked.reply.value : null
}

let iframe: HTMLIFrameElement | undefined

afterEach(() => {
  iframe?.remove()
  iframe = undefined
})

async function frameOf(body: string, head = ''): Promise<HTMLIFrameElement> {
  iframe = await bridgedFrame(body, {
    hash: HASH,
    head,
    style: 'width:200px;height:160px',
  })
  return iframe
}

describe('model', () => {
  it('reads a viewer no script drew as its attributes alone', async () => {
    const frame = await frameOf(
      '<model-viewer src="a.glb" camera-orbit="40deg 60deg auto" autoplay></model-viewer>',
    )

    const asked = await ask(frame, 'model', BARE)
    asked.close()

    expect(asked.reply).toEqual({
      value: {
        src: 'a.glb',
        loaded: false,
        clips: [],
        orbit: null,
        staged: {
          'camera-orbit': '40deg 60deg auto',
          'max-camera-orbit': null,
          orientation: null,
          scale: null,
          'animation-name': null,
          autoplay: '',
        },
      },
    })
  })

  it('pushes the clips and the camera angle once the model loads', async () => {
    const frame = await frameOf(spinning(), SCRIPT)
    const asked = await ask(frame, 'model', DRAWN)

    await expect
      .poll(() => latest(asked))
      .toMatchObject({
        loaded: true,
        clips: ['Spin'],
        orbit: { theta: 0, phi: 75 },
      })
    asked.close()
  })

  it('answers null for an address holding no viewer', async () => {
    const frame = await frameOf('<p>Words</p>')

    const asked = await ask(frame, 'model', BARE)

    expect(asked.reply).toEqual({ value: null })
  })
})

describe('model-stage', () => {
  it('states the attribute on the live viewer and pushes the reading', async () => {
    const frame = await frameOf('<model-viewer src="a.glb"></model-viewer>')
    const asked = await ask(frame, 'model', BARE)

    const staged = await ask(frame, 'model-stage', {
      ...BARE,
      name: 'orientation',
      value: '0deg 20deg 0deg',
    })

    expect(staged.reply).toEqual({ value: true })
    await expect
      .poll(() => latest(asked)?.staged.orientation)
      .toBe('0deg 20deg 0deg')
    asked.close()
  })

  it('drops the attribute on a null value', async () => {
    const frame = await frameOf(
      '<model-viewer src="a.glb" autoplay></model-viewer>',
    )

    await ask(frame, 'model-stage', { ...BARE, name: 'autoplay', value: null })

    expect(
      frame.contentDocument
        ?.querySelector('model-viewer')
        ?.hasAttribute('autoplay'),
    ).toBe(false)
  })

  it('moves the live camera to a staged orbit at once', async () => {
    const frame = await frameOf(spinning(), SCRIPT)
    const asked = await ask(frame, 'model', DRAWN)
    await expect.poll(() => latest(asked)?.loaded).toBe(true)

    await ask(frame, 'model-stage', {
      ...DRAWN,
      name: 'camera-orbit',
      value: '-40deg 60deg auto',
    })

    await expect
      .poll(() => latest(asked)?.orbit)
      .toEqual({ theta: -40, phi: 60 })
    asked.close()
  })

  it('answers false for an address holding no viewer', async () => {
    const frame = await frameOf('<p>Words</p>')

    const staged = await ask(frame, 'model-stage', {
      ...BARE,
      name: 'scale',
      value: '2 2 2',
    })

    expect(staged.reply).toEqual({ value: false })
  })
})
