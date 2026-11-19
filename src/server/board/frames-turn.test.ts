import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../../test/support/fixture-board'
import { recordingJournal } from '../../../test/support/recording-journal'
import { readFrame, resizeFrame, setBoxes, setFrameDevice } from './frames'

describe('a turned phone or tablet', () => {
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

  function setHero(root: string, flags: object): void {
    const page = layout('webapp/home')
    Object.assign(page.frames.hero, flags)
    writeFileSync(join(root, 'webapp/home/layout.json'), JSON.stringify(page))
  }

  const HERO = 'webapp/home/hero'
  const PHONE = { width: 390, height: 844, showDevice: true }

  describe('the turned box', () => {
    it('swaps a fixed phone’s sides, keeping its upright size and leaving the frame file alone', async () => {
      const root = open()
      setHero(root, { ...PHONE, x: 40, y: 60 })
      const bytes = file('webapp/home/hero.html')

      const turned = await setFrameDevice(root, HERO, undefined, {
        cwd: root,
        turn: 'left',
      })

      expect(turned).toMatchObject({
        device: 'phone',
        turn: 'left',
        box: { x: 40, y: 60, width: 844, height: 390 },
      })
      expect(turned).not.toHaveProperty('upright')
      expect(layout('webapp/home').frames.hero).toMatchObject({
        turn: 'left',
        upright: { width: 390, height: 844 },
        width: 844,
        height: 390,
      })
      expect(file('webapp/home/hero.html')).toBe(bytes)
    })

    it('swaps a scroll phone’s sides, still scrolling', async () => {
      const root = open()
      setHero(root, { ...PHONE, scroll: true })

      const turned = await setFrameDevice(root, HERO, undefined, {
        cwd: root,
        turn: 'right',
      })

      expect(turned).toMatchObject({
        turn: 'right',
        scroll: true,
        box: { width: 844, height: 390 },
      })
    })

    it('lays a page-tall hugging phone out at its reference height wide, never its page’s', async () => {
      const root = open()
      setHero(root, { ...PHONE, height: 2328, hugHeight: true })

      const turned = await setFrameDevice(root, HERO, undefined, {
        cwd: root,
        turn: 'left',
      })

      expect(turned).toMatchObject({
        hugHeight: true,
        box: { width: 844, height: 390 },
      })
      expect(layout('webapp/home').frames.hero.upright).toEqual({
        width: 390,
        height: 2328,
      })
    })

    it('turns a tablet and reads it as a tablet, never the laptop its width reaches', async () => {
      const root = open()
      setHero(root, { width: 834, height: 1194, showDevice: true })

      const turned = await setFrameDevice(root, HERO, undefined, {
        cwd: root,
        turn: 'left',
      })

      expect(turned).toMatchObject({
        device: 'tablet',
        box: { width: 1194, height: 834 },
      })
    })

    it('goes from left to right without moving the box or the kept size', async () => {
      const root = open()
      setHero(root, PHONE)
      await setFrameDevice(root, HERO, undefined, { cwd: root, turn: 'left' })

      const turned = await setFrameDevice(root, HERO, undefined, {
        cwd: root,
        turn: 'right',
      })

      expect(turned).toMatchObject({
        turn: 'right',
        box: { width: 844, height: 390 },
      })
      expect(layout('webapp/home').frames.hero.upright).toEqual({
        width: 390,
        height: 844,
      })
    })
  })

  describe('standing it upright', () => {
    it('restores the kept size and clears both keys', async () => {
      const root = open()
      setHero(root, PHONE)
      await setFrameDevice(root, HERO, undefined, { cwd: root, turn: 'left' })

      const upright = await setFrameDevice(root, HERO, undefined, {
        cwd: root,
        turn: 'upright',
      })

      expect(upright).toMatchObject({ box: { width: 390, height: 844 } })
      expect(upright).not.toHaveProperty('turn')
      const entry = layout('webapp/home').frames.hero
      expect(entry).not.toHaveProperty('turn')
      expect(entry).not.toHaveProperty('upright')
    })

    it('restores the size from before the turn after a hand resize of the turned box', async () => {
      const root = open()
      setHero(root, PHONE)
      const turned = await setFrameDevice(root, HERO, undefined, {
        cwd: root,
        turn: 'left',
      })
      await setBoxes(
        root,
        'webapp/home',
        { hero: { ...turned.box, width: 900, height: 420 } },
        { hero: turned.box },
        { cwd: root },
      )

      const upright = await setFrameDevice(root, HERO, undefined, {
        cwd: root,
        turn: 'upright',
      })

      expect(upright.box).toMatchObject({ width: 390, height: 844 })
    })

    it('stands a turned frame upright before naming it the foldable', async () => {
      const root = open()
      setHero(root, PHONE)
      await setFrameDevice(root, HERO, undefined, { cwd: root, turn: 'left' })

      const named = await setFrameDevice(root, HERO, undefined, {
        cwd: root,
        foldable: true,
      })

      expect(named).toMatchObject({ device: 'foldable', pose: 'closed' })
      expect(named).not.toHaveProperty('turn')
      expect(layout('webapp/home').frames.hero).not.toHaveProperty('upright')
    })

    it('undoes a turn as one entry change', async () => {
      const root = open()
      setHero(root, PHONE)
      const { journal, calls } = recordingJournal(root)

      await setFrameDevice(root, HERO, undefined, {
        cwd: root,
        turn: 'left',
        journal,
      })

      expect(calls).toHaveLength(1)
      expect(calls[0]).toMatchObject({
        kind: 'entry',
        frame: 'hero',
        before: { width: 390, height: 844 },
        after: { width: 844, height: 390, turn: 'left' },
      })
    })
  })

  describe('refusals', () => {
    it.each([
      ['a laptop', { width: 1440, height: 900, showDevice: true }],
      ['a frame showing no device', { width: 390, height: 844 }],
      ['a foldable', { ...PHONE, foldable: true, pose: 'closed' }],
      [
        'a frame holding extra widths',
        { ...PHONE, widths: [{ width: 430, height: 932 }] },
      ],
    ])('refuses a turn on %s and writes nothing', async (_label, flags) => {
      const root = open()
      setHero(root, flags)
      const before = layout('webapp/home')

      await expect(
        setFrameDevice(root, HERO, undefined, { cwd: root, turn: 'left' }),
      ).rejects.toMatchObject({ code: 'usage' })
      expect(layout('webapp/home')).toEqual(before)
    })

    it('refuses extra widths on a turned frame', async () => {
      const root = open()
      setHero(root, PHONE)
      await setFrameDevice(root, HERO, undefined, { cwd: root, turn: 'left' })

      await expect(
        resizeFrame(root, HERO, { cwd: root, widths: [430] }),
      ).rejects.toMatchObject({ code: 'usage' })
    })

    it('keeps the turn while the device is hidden, drawing no body', async () => {
      const root = open()
      setHero(root, PHONE)
      await setFrameDevice(root, HERO, undefined, { cwd: root, turn: 'left' })

      await setFrameDevice(root, HERO, false, { cwd: root })
      const hidden = await readFrame(root, HERO, { cwd: root })

      expect(hidden).not.toHaveProperty('device')
      expect(hidden).toMatchObject({ turn: 'left', box: { width: 844 } })
    })
  })
})
