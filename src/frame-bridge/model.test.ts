import { afterEach, describe, expect, it } from 'vitest'

import type {
  ModelReading,
  ModelStage,
  ModelTransform,
} from '@/shared/frame-bridge/model'
import { ask, type Asked, bridgedFrame } from '@/test/frame-bridge'

const HASH = 'c'.repeat(64)
// Past the injected style and script: html 0, head 1, body 2, the viewer 3.
const BARE = { index: 3, hash: HASH }
// The viewer's own script counts as the file's: html 0, head 1, script 2, body 3, the viewer 4.
const DRAWN = { index: 4, hash: HASH }

// A stand-in that draws nothing, since the real viewer's WebGL starves the tests sharing this browser.
const SCRIPT =
  '<script type="module" src="/src/test/model-viewer-stub.js"></script>'

/** A viewer the stand-in loads with one clip named Spin. */
const spinning = (attributes = '') =>
  `<model-viewer src="spin.glb" ${attributes}></model-viewer>`

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
        camera: null,
        bounds: null,
        staged: {
          'camera-orbit': '40deg 60deg auto',
          'min-camera-orbit': null,
          'max-camera-orbit': null,
          'camera-target': null,
          'field-of-view': null,
          'max-field-of-view': null,
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

  it('rests a playing model at the start of its clip once autoplay goes', async () => {
    const frame = await frameOf(spinning('autoplay'), SCRIPT)
    const asked = await ask(frame, 'model', DRAWN)
    await expect.poll(() => latest(asked)?.loaded).toBe(true)
    asked.close()

    await ask(frame, 'model-stage', { ...DRAWN, name: 'autoplay', value: null })

    const viewer = frame.contentDocument?.querySelector('model-viewer') as
      | (Element & { paused: boolean; currentTime: number })
      | null
      | undefined
    expect({ paused: viewer?.paused, time: viewer?.currentTime }).toEqual({
      paused: true,
      time: 0,
    })
  })

  it('draws a staged turn at once, which the viewer leaves for its next camera move', async () => {
    const frame = await frameOf(spinning(), SCRIPT)
    const asked = await ask(frame, 'model', DRAWN)
    await expect.poll(() => latest(asked)?.loaded).toBe(true)
    asked.close()

    await ask(frame, 'model-stage', {
      ...DRAWN,
      name: 'orientation',
      value: '0deg 0deg 40deg',
    })

    await expect
      .poll(() => frame.contentDocument?.querySelector('model-viewer'))
      .toHaveProperty('drawn.orientation', '0deg 0deg 40deg')
  })

  it('rests a model at its own size once its scale goes', async () => {
    const frame = await frameOf(spinning('scale="2 2 2"'), SCRIPT)
    const asked = await ask(frame, 'model', DRAWN)
    await expect.poll(() => latest(asked)?.loaded).toBe(true)

    await ask(frame, 'model-stage', { ...DRAWN, name: 'scale', value: null })
    await ask(frame, 'model-stage', {
      ...DRAWN,
      name: 'camera-target',
      value: null,
    })

    await expect.poll(() => latest(asked)?.bounds?.size.y).toBe(1.5)
    asked.close()
  })

  it('rests a model facing its own front once its orientation goes', async () => {
    const frame = await frameOf(
      spinning('orientation="0deg 40deg 0deg"'),
      SCRIPT,
    )
    const asked = await ask(frame, 'model', DRAWN)
    await expect.poll(() => latest(asked)?.loaded).toBe(true)
    asked.close()

    await ask(frame, 'model-stage', {
      ...DRAWN,
      name: 'orientation',
      value: null,
    })

    const viewer = frame.contentDocument?.querySelector('model-viewer')
    expect(viewer).toHaveProperty('orientation', '0 0 0')
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

/** The live viewer's reading once its model loads. */
async function drawn(attributes = '', box = 'width:200px;height:200px') {
  const frame = await frameOf(
    spinning(`style="display:block;${box}" ${attributes}`.trim()),
    SCRIPT,
  )
  const asked = await ask(frame, 'model', DRAWN)
  await expect.poll(() => latest(asked)?.loaded).toBe(true)
  const reading = () => {
    const held = latest(asked)
    if (!held) throw new Error('the viewer reads as nothing')
    return held
  }
  return { frame, reading, close: () => asked.close() }
}

/** Sizes and places the drawn viewer, answering the attributes to write. */
async function transform(frame: HTMLIFrameElement, args: ModelTransform) {
  const asked = await ask(frame, 'model-transform', { ...DRAWN, ...args })
  await expect.poll(() => asked.pushes.length).toBe(1)
  asked.close()
  return asked.pushes[0] ?? []
}

/** The attributes an answer leaves stated, as the file would hold them. */
const stated = (stages: readonly ModelStage[]) =>
  stages
    .filter(({ value }) => value !== null)
    .map(({ name, value }) => `${name}="${value}"`)
    .join(' ')

const even = (scale: number) => ({ x: scale, y: scale, z: scale })

describe('model-transform', () => {
  it('holds the camera still as the model grows', async () => {
    const { frame, reading, close } = await drawn()
    const before = reading().camera

    await transform(frame, { scale: even(2), depth: 0 })

    await expect.poll(() => reading().bounds?.size.y).toBe(3)
    expect(reading().camera).toEqual(before)
    close()
  })

  it.each([
    ['a larger model', even(2), 0, 'width:200px;height:200px'],
    ['a smaller model', even(0.5), 0, 'width:200px;height:200px'],
    ['a model nearer', even(1), 1, 'width:200px;height:200px'],
    [
      'a wider model in a narrow box',
      { x: 3, y: 1, z: 1 },
      0,
      'width:80px;height:200px',
    ],
    [
      'a thinner model in a narrow box',
      { x: 0.3, y: 1, z: 1 },
      0,
      'width:80px;height:200px',
    ],
  ])(
    'answers what a fresh load draws %s by',
    async (_name, scale, depth, box) => {
      const live = await drawn('', box)
      const before = live.reading().camera
      const answered = await transform(live.frame, { scale, depth })
      const shown = live.reading()
      live.close()
      live.frame.remove()

      const fresh = await drawn(stated(answered), box)

      expect(fresh.reading().bounds).toEqual(shown.bounds)
      expect(fresh.reading().camera?.distance).toBeCloseTo(
        before?.distance ?? 0,
        3,
      )
      expect(fresh.reading().camera?.view).toBeCloseTo(before?.view ?? 0, 1)
      fresh.close()
    },
  )

  it('keeps the distance and angles a file states', async () => {
    const { frame, reading, close } = await drawn(
      'camera-orbit="30deg 60deg 3m" max-camera-orbit="auto 120deg 3m"',
    )
    const before = reading().camera

    const answered = await transform(frame, { scale: even(2), depth: 0 })

    expect(stated(answered)).toContain(
      'camera-orbit="30deg 60deg 3m" min-camera-orbit="auto auto 0m" max-camera-orbit="auto 120deg 3m"',
    )
    expect(before?.distance).toBe(3)
    close()
  })

  it.each([
    ['a size', { scale: even(1.2), depth: 0 }],
    ['a smaller size', { scale: even(0.8), depth: 0 }],
    ['a size within its tolerance', { scale: even(1.001), depth: 0 }],
    ['a depth', { scale: even(1), depth: 0.2 }],
  ])(
    'keeps the limits a file states through %s and back at rest',
    async (_name, sized) => {
      const limits =
        'camera-orbit="0deg 75deg 3m" min-camera-orbit="auto auto 2m" max-camera-orbit="auto auto 10m"'
      const { frame, close } = await drawn(limits)

      const held = await transform(frame, sized)
      const rested = await transform(frame, { scale: even(1), depth: 0 })

      expect(stated(held)).toContain(
        'min-camera-orbit="auto auto 2m" max-camera-orbit="auto auto 10m"',
      )
      expect(stated(rested)).toBe(limits)
      close()
    },
  )

  it('stands where it did for a larger model under a farthest limit the file states', async () => {
    const own = 'max-camera-orbit="auto auto 10m"'
    const { frame, reading, close } = await drawn(own)
    const before = reading().camera

    const answered = await transform(frame, { scale: even(2), depth: 0 })

    expect(reading().camera?.distance).toBeCloseTo(before?.distance ?? 0, 3)
    expect(stated(answered)).toContain(
      'min-camera-orbit="auto auto 0m" max-camera-orbit="auto auto 10m"',
    )
    close()
  })

  it('drops the limit it added once a file with its own distance is back at rest', async () => {
    const own = 'camera-orbit="0deg 75deg 3m" max-camera-orbit="auto auto 3m"'
    const { frame, close } = await drawn(own)
    await transform(frame, { scale: even(2), depth: 0 })

    const rested = await transform(frame, { scale: even(1), depth: 0 })

    expect(stated(rested)).toBe(own)
    close()
  })

  it('counts a depth from the center its scale moves', async () => {
    const { frame, close } = await drawn()

    const answered = await transform(frame, { scale: even(2), depth: 0.25 })

    expect(stated(answered)).toContain('camera-target="auto auto 0.75m"')
    close()
  })

  it('leaves a target it cannot read alone', async () => {
    const { frame, close } = await drawn(
      'camera-target="auto 1m calc(1m + 1m)"',
    )

    const answered = await transform(frame, { scale: even(2), depth: null })

    expect(stated(answered)).toContain('camera-target="auto 1m calc(1m + 1m)"')
    close()
  })

  it('states nothing once the model is back at rest', async () => {
    const { frame, reading, close } = await drawn('', 'width:80px;height:200px')
    const first = reading().camera
    await transform(frame, { scale: { x: 3, y: 1, z: 1 }, depth: 0.5 })

    const answered = await transform(frame, { scale: even(1), depth: 0 })

    expect(stated(answered)).toBe('')
    expect(reading().camera?.distance).toBeCloseTo(first?.distance ?? 0, 3)
    expect(reading().camera?.view).toBeCloseTo(first?.view ?? 0, 1)
    close()
  })

  it('previews a transform with the camera still and no attribute to hold it', async () => {
    const { frame, reading, close } = await drawn()
    const before = reading().camera

    const asked = await ask(frame, 'model-transform', {
      ...DRAWN,
      scale: even(2),
      depth: 0,
      preview: true,
    })

    await expect.poll(() => reading().bounds?.size.y).toBe(3)
    expect(reading().camera).toEqual(before)
    expect(reading().staged['camera-orbit']).toBeNull()
    expect(asked.pushes).toEqual([])
    asked.close()
    close()
  })

  it('answers false for a viewer still loading its model', async () => {
    const frame = await frameOf('<model-viewer src="a.glb"></model-viewer>')

    const asked = await ask(frame, 'model-transform', {
      ...BARE,
      scale: even(2),
      depth: 0,
    })

    expect(asked.reply).toEqual({ value: false })
  })
})
