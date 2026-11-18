import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../../test/support/fixture-board'
import { moveFrame, readFrame, resizeFrame, setFrameDevice } from './frames'

describe('a frame naming the foldable', () => {
  let board: FixtureBoard

  afterEach(() => {
    board.cleanup()
  })

  function open(): string {
    board = copyFixtureBoard('basic')
    return board.root
  }

  function file(path: string): string {
    return readFileSync(join(board.root, path), 'utf8')
  }

  function layout(page: string) {
    return JSON.parse(file(`${page}/layout.json`))
  }

  function hugHero(root: string, flags: object): void {
    const page = layout('webapp/home')
    Object.assign(page.frames.hero, flags)
    writeFileSync(join(root, 'webapp/home/layout.json'), JSON.stringify(page))
  }

  const HERO = 'webapp/home/hero'

  it('names a foldable over the width, shown in the nearest pose, writing the layout entry alone', async () => {
    const root = open()
    const bytes = file('webapp/home/hero.html')

    const named = await setFrameDevice(root, HERO, undefined, {
      cwd: root,
      foldable: true,
    })

    expect(named).toMatchObject({
      showDevice: true,
      device: 'foldable',
      pose: 'open',
      box: { width: 890, height: 626 },
      hugWidth: false,
      hugHeight: false,
    })
    expect(layout('webapp/home').frames.hero).toMatchObject({
      showDevice: true,
      foldable: true,
      pose: 'open',
    })
    expect(file('webapp/home/hero.html')).toBe(bytes)
  })

  it('starts a phone-wide frame closed', async () => {
    const root = open()
    hugHero(root, { width: 390 })

    const named = await setFrameDevice(root, HERO, undefined, {
      cwd: root,
      foldable: true,
    })

    expect(named).toMatchObject({
      pose: 'closed',
      box: { width: 466, height: 678 },
    })
  })

  it.each([
    ['closed', 466, 678],
    ['half', 890, 626],
    ['open', 890, 626],
  ] as const)(
    'folds to %s, setting the box to %i by %i where it stands',
    async (pose, width, height) => {
      const root = open()
      hugHero(root, { x: 40, y: 60 })

      const folded = await setFrameDevice(root, HERO, undefined, {
        cwd: root,
        foldable: true,
        pose,
      })

      expect(folded).toMatchObject({
        pose,
        box: { x: 40, y: 60, width, height },
      })
    },
  )

  it('refuses a pose on a frame naming no foldable and writes nothing', async () => {
    const root = open()
    const before = layout('webapp/home')

    await expect(
      setFrameDevice(root, HERO, undefined, { cwd: root, pose: 'open' }),
    ).rejects.toMatchObject({ code: 'usage' })
    expect(layout('webapp/home')).toEqual(before)
  })

  it('keeps the name, the pose, and its size when switched off, drawing no body', async () => {
    const root = open()
    await setFrameDevice(root, HERO, undefined, {
      cwd: root,
      foldable: true,
      pose: 'half',
    })

    const hidden = await setFrameDevice(root, HERO, false, { cwd: root })

    expect(hidden).not.toHaveProperty('device')
    expect(hidden).not.toHaveProperty('showDevice')
    expect(hidden).toMatchObject({
      pose: 'half',
      box: { width: 890, height: 626 },
    })
    expect(layout('webapp/home').frames.hero).toMatchObject({
      foldable: true,
      pose: 'half',
    })
  })

  it('shows the foldable again in the pose it held', async () => {
    const root = open()
    await setFrameDevice(root, HERO, false, {
      cwd: root,
      foldable: true,
      pose: 'half',
    })

    const shown = await setFrameDevice(root, HERO, true, { cwd: root })

    expect(shown).toMatchObject({ device: 'foldable', pose: 'half' })
  })

  it('leaves a hand-set size alone when shown again with no pose', async () => {
    const root = open()
    await setFrameDevice(root, HERO, undefined, {
      cwd: root,
      foldable: true,
    })
    await resizeFrame(root, HERO, { cwd: root, height: 900 })

    const shown = await setFrameDevice(root, HERO, true, { cwd: root })

    expect(shown.box).toMatchObject({ width: 890, height: 900 })
  })

  it('hands the pick back to the width when un-named, leaving neither key', async () => {
    const root = open()
    await setFrameDevice(root, HERO, undefined, {
      cwd: root,
      foldable: true,
    })

    const plain = await setFrameDevice(root, HERO, undefined, {
      cwd: root,
      foldable: false,
    })

    expect(plain).toMatchObject({ showDevice: true, device: 'tablet' })
    expect(plain).not.toHaveProperty('pose')
    const entry = layout('webapp/home').frames.hero
    expect(entry).not.toHaveProperty('foldable')
    expect(entry).not.toHaveProperty('pose')
  })

  it('reads the older device key naming a foldable as shown by the width, never as a foldable', async () => {
    const root = open()
    hugHero(root, { device: 'foldable' })

    const hero = await readFrame(root, HERO, { cwd: root })

    expect(hero).toMatchObject({ showDevice: true, device: 'laptop' })
    expect(hero).not.toHaveProperty('pose')
  })

  it('keeps a pose no reader knows as written, reading it as closed', async () => {
    const root = open()
    hugHero(root, { showDevice: true, foldable: true, pose: 'tent' })

    const moved = await moveFrame(root, HERO, { cwd: root, x: 40 })

    expect(moved).toMatchObject({ device: 'foldable', pose: 'closed' })
    expect(layout('webapp/home').frames.hero.pose).toBe('tent')
  })

  it('keeps the widths its entry listed in the file and draws none', async () => {
    const root = open()
    const widths = [{ width: 390, height: 844 }]
    hugHero(root, { widths })

    const named = await setFrameDevice(root, HERO, undefined, {
      cwd: root,
      foldable: true,
    })

    expect(named.widths).toEqual([])
    expect(layout('webapp/home').frames.hero.widths).toEqual(widths)
  })

  it('draws the widths its entry kept again once un-named', async () => {
    const root = open()
    const widths = [{ width: 390, height: 844 }]
    hugHero(root, { widths })
    await setFrameDevice(root, HERO, undefined, { cwd: root, foldable: true })
    await moveFrame(root, HERO, { cwd: root, x: 40 })

    const plain = await setFrameDevice(root, HERO, undefined, {
      cwd: root,
      foldable: false,
    })

    expect(plain.widths).toEqual(widths)
    expect(layout('webapp/home').frames.hero.widths).toEqual(widths)
  })

  it('drops a kept width the un-named box now holds itself', async () => {
    const root = open()
    hugHero(root, {
      widths: [
        { width: 890, height: 626 },
        { width: 390, height: 844 },
      ],
    })
    await setFrameDevice(root, HERO, undefined, { cwd: root, foldable: true })

    const plain = await setFrameDevice(root, HERO, undefined, {
      cwd: root,
      foldable: false,
    })

    expect(plain.widths).toEqual([{ width: 390, height: 844 }])
  })

  it('clears the widths a foldable kept on an explicit clear', async () => {
    const root = open()
    hugHero(root, { widths: [{ width: 390, height: 844 }] })
    await setFrameDevice(root, HERO, undefined, { cwd: root, foldable: true })

    await resizeFrame(root, HERO, { cwd: root, widths: false })

    expect(layout('webapp/home').frames.hero).not.toHaveProperty('widths')
  })

  it('refuses a linked width on a foldable', async () => {
    const root = open()
    await setFrameDevice(root, HERO, undefined, {
      cwd: root,
      foldable: true,
    })

    await expect(
      resizeFrame(root, HERO, { cwd: root, widths: [390] }),
    ).rejects.toMatchObject({ code: 'usage' })
  })
})
