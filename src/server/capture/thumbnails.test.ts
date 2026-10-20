import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { RenderFrame } from '@/server/capture/render'
import type { Theme } from '@/shared/theme'

import { type TempBoard, writeBoard } from '../../../test/support/temp-board'
import { createThumbnailStore, type ThumbnailStore } from './thumbnails'

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47])
const HERO = { ref: 'studio/home/hero', box: { width: 390, height: 844 } }

interface Landed {
  theme: Theme
  stamps: Record<string, string>
}

/** A renderer counting its calls, whose renders finish only once released. */
function fakeRenderer(answer: () => Promise<Buffer> = async () => PNG) {
  const calls: string[] = []
  const pending: (() => void)[] = []
  const render: RenderFrame = async (frame, theme) => {
    calls.push(`${frame.ref} ${theme} ${frame.box.width}x${frame.box.height}`)
    await new Promise<void>((resolve) => pending.push(resolve))
    return answer()
  }
  const release = () => {
    for (const resolve of pending.splice(0)) resolve()
  }
  return { render, calls, release }
}

/** Lets every render waiting finish, then settles on the store taking them in. */
async function landAll(
  fake: { release: () => void },
  ...stores: ThumbnailStore[]
): Promise<void> {
  fake.release()
  await Promise.all(stores.map((store) => store.settled()))
}

describe('createThumbnailStore', () => {
  let board: TempBoard
  let landed: Landed[]

  beforeEach(() => {
    board = writeBoard({})
    landed = []
  })

  afterEach(() => {
    board.cleanup()
  })

  function storeWith(render: RenderFrame): ThumbnailStore {
    return createThumbnailStore({
      root: board.root,
      run: 'r1',
      render,
      onRendered: (theme, stamps) => landed.push({ theme, stamps }),
    })
  }

  it('answers no stamp for a frame not rendered yet, and queues it', () => {
    const fake = fakeRenderer()
    const store = storeWith(fake.render)

    const stamps = store.ask('light', [HERO])

    expect(stamps).toEqual({})
    expect(fake.calls).toEqual(['studio/home/hero light 390x844'])
  })

  it('announces the stamp once the render lands, and answers it after', async () => {
    const fake = fakeRenderer()
    const store = storeWith(fake.render)
    store.ask('light', [HERO])

    await landAll(fake, store)

    const stamp = landed[0]?.stamps['studio/home/hero']
    expect(landed).toEqual([
      { theme: 'light', stamps: { 'studio/home/hero': stamp } },
    ])
    expect(store.ask('light', [HERO])).toEqual({ 'studio/home/hero': stamp })
  })

  it('writes the capture under .run/thumbnails by project, page, and frame', async () => {
    const fake = fakeRenderer()
    const store = storeWith(fake.render)
    store.ask('dark', [HERO])

    await landAll(fake, store)

    const path = join(board.root, '.run/thumbnails/studio/home/hero.dark.png')
    expect(readFileSync(path)).toEqual(PNG)
  })

  it('renders a missing frame once however often it is asked', () => {
    const fake = fakeRenderer()
    const store = storeWith(fake.render)

    store.ask('light', [HERO])
    store.ask('light', [HERO])
    store.ask('light', [HERO])

    expect(fake.calls).toHaveLength(1)
  })

  it('renders each theme apart', () => {
    const fake = fakeRenderer()
    const store = storeWith(fake.render)

    store.ask('light', [HERO])
    store.ask('dark', [HERO])

    expect(fake.calls).toEqual([
      'studio/home/hero light 390x844',
      'studio/home/hero dark 390x844',
    ])
  })

  it('counts a frame whose box size changed as stale', async () => {
    const fake = fakeRenderer()
    const store = storeWith(fake.render)
    store.ask('light', [HERO])
    await landAll(fake, store)

    const stamps = store.ask('light', [
      { ref: HERO.ref, box: { width: 768, height: 1024 } },
    ])

    expect(stamps).toEqual({})
    expect(fake.calls).toEqual([
      'studio/home/hero light 390x844',
      'studio/home/hero light 768x1024',
    ])
  })

  it('drops both themes of an invalidated frame and renders it on the next ask', async () => {
    const fake = fakeRenderer()
    const store = storeWith(fake.render)
    store.ask('light', [HERO])
    store.ask('dark', [HERO])
    await landAll(fake, store)

    store.invalidate([HERO.ref])

    expect(store.ask('light', [HERO])).toEqual({})
    expect(store.ask('dark', [HERO])).toEqual({})
    expect(fake.calls).toHaveLength(4)
  })

  it('gives an invalidated frame a new stamp', async () => {
    const fake = fakeRenderer()
    const store = storeWith(fake.render)
    store.ask('light', [HERO])
    await landAll(fake, store)
    store.invalidate([HERO.ref])
    store.ask('light', [HERO])

    await landAll(fake, store)

    const [first, second] = landed.map((land) => land.stamps[HERO.ref])
    expect(second).toBeDefined()
    expect(second).not.toBe(first)
  })

  it('drops a render the frame changed under, announcing nothing for it', async () => {
    const fake = fakeRenderer()
    const store = storeWith(fake.render)
    store.ask('light', [HERO])
    store.invalidate([HERO.ref])

    await landAll(fake, store)

    expect(landed).toEqual([])
    expect(store.ask('light', [HERO])).toEqual({})
  })

  it('does not render a failed frame again until it changes', async () => {
    const fake = fakeRenderer(async () => {
      throw new Error('font-missing')
    })
    const store = storeWith(fake.render)
    store.ask('light', [HERO])
    await landAll(fake, store)

    store.ask('light', [HERO])
    const before = fake.calls.length
    store.invalidate([HERO.ref])
    store.ask('light', [HERO])

    expect(landed).toEqual([])
    expect(before).toBe(1)
    expect(fake.calls).toHaveLength(2)
  })

  it('names the stored file only for the current stamp', async () => {
    const fake = fakeRenderer()
    const store = storeWith(fake.render)
    store.ask('light', [HERO])
    await landAll(fake, store)
    const stamp = landed[0]?.stamps[HERO.ref] ?? ''

    const current = store.file(HERO.ref, 'light', stamp)
    const stale = store.file(HERO.ref, 'light', `${stamp}-old`)
    const otherTheme = store.file(HERO.ref, 'dark', stamp)

    expect(current && readFileSync(current)).toEqual(PNG)
    expect([stale, otherTheme]).toEqual([null, null])
  })

  it('stamps apart from a server run that came before', async () => {
    const fake = fakeRenderer()
    const earlier = createThumbnailStore({
      root: board.root,
      run: 'r0',
      render: fake.render,
      onRendered: (theme, stamps) => landed.push({ theme, stamps }),
    })
    const store = storeWith(fake.render)
    earlier.ask('light', [HERO])
    store.ask('light', [HERO])

    await landAll(fake, earlier, store)

    const [first, second] = landed.map((land) => land.stamps[HERO.ref])
    expect(second).not.toBe(first)
  })

  it('empties the folder a previous server left', async () => {
    const fake = fakeRenderer()
    const store = storeWith(fake.render)
    store.ask('light', [HERO])
    await landAll(fake, store)

    await store.empty()

    expect(existsSync(join(board.root, '.run/thumbnails'))).toBe(false)
  })
})
