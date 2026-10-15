import {
  existsSync,
  readFileSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../../test/support/fixture-board'
import {
  addFrame,
  deleteFrame,
  duplicateFrame,
  moveFrame,
  orderFrame,
  renameFrame,
  resizeFrame,
  setFrameFlag,
  skeleton,
} from './frames'

describe('frames', () => {
  let board: FixtureBoard

  afterEach(() => {
    board.cleanup()
  })

  function file(path: string): string {
    return readFileSync(join(board.root, path), 'utf8')
  }

  function layout(page: string) {
    return JSON.parse(file(`${page}/layout.json`))
  }

  describe('on the basic board', () => {
    function open(): string {
      board = copyFixtureBoard('basic')
      return board.root
    }

    describe('layout-only verbs', () => {
      const frame = 'webapp/home/hero.html'
      const verbs = [
        [
          'move',
          (root: string) =>
            moveFrame(root, 'webapp/home/hero', { cwd: root, x: 40, y: 60 }),
        ],
        [
          'resize',
          (root: string) =>
            resizeFrame(root, 'webapp/home/hero', { cwd: root, size: 'phone' }),
        ],
        [
          'order',
          (root: string) =>
            orderFrame(root, 'webapp/home/hero', { cwd: root, index: 1 }),
        ],
        [
          'hide',
          (root: string) =>
            setFrameFlag(root, 'webapp/home/hero', 'hidden', {
              cwd: root,
              on: true,
            }),
        ],
        [
          'lock',
          (root: string) =>
            setFrameFlag(root, 'webapp/home/hero', 'locked', {
              cwd: root,
              on: true,
            }),
        ],
      ] as const

      it.each(verbs)(
        '%s leaves the frame file bytes and mtime alone',
        async (_verb, run) => {
          const root = open()
          const before = new Date('2026-01-01T00:00:00Z')
          utimesSync(join(root, frame), before, before)
          const bytes = file(frame)

          await run(root)

          expect(file(frame)).toBe(bytes)
          expect(statSync(join(root, frame)).mtime).toEqual(before)
        },
      )
    })

    it('move sets the position and keeps the size', async () => {
      const root = open()

      const moved = await moveFrame(root, 'webapp/home/about', {
        cwd: root,
        x: -200,
      })

      expect(moved.box).toEqual({ x: -200, y: 0, width: 390, height: 844 })
    })

    it('order clamps the index and renumbers densely', async () => {
      const root = open()

      await orderFrame(root, 'webapp/home/hero', { cwd: root, index: 9 })

      expect(layout('webapp/home').frames).toMatchObject({
        about: { order: 0 },
        hero: { order: 1 },
      })
    })

    it('keeps an unknown key on an entry it changes', async () => {
      const root = open()
      const page = layout('webapp/home')
      page.frames.hero.tint = 'red'
      writeFileSync(join(root, 'webapp/home/layout.json'), JSON.stringify(page))

      await resizeFrame(root, 'webapp/home/hero', { cwd: root, width: 800 })

      expect(layout('webapp/home').frames.hero).toMatchObject({
        tint: 'red',
        width: 800,
      })
    })

    it('add writes a skeleton and places it past every frame', async () => {
      const root = open()

      const added = await addFrame(root, 'webapp/home/pricing', {
        cwd: root,
        size: 'tablet',
      })

      expect(file('webapp/home/pricing.html')).toBe(skeleton('pricing'))
      expect(added).toMatchObject({
        box: { x: 1990, y: 0, width: 834, height: 1194 },
        order: 2,
        placed: true,
      })
    })

    it('add fails name-taken on a frame with a file and an entry', async () => {
      const root = open()

      await expect(
        addFrame(root, 'webapp/home/hero', { cwd: root }),
      ).rejects.toMatchObject({ code: 'name-taken', exitCode: 4 })
    })

    it('duplicate in its own page sits 80 past the source on top', async () => {
      const root = open()

      const copy = await duplicateFrame(root, 'webapp/home/hero', { cwd: root })

      expect(copy).toMatchObject({
        name: 'hero-2',
        box: { x: 1520, y: 0, width: 1440, height: 900 },
        order: 2,
      })
      expect(file('webapp/home/hero-2.html')).toBe(
        file('webapp/home/hero.html'),
      )
    })

    it('duplicate into another project keeps the box and takes -2 on a collision', async () => {
      const root = open()
      writeFileSync(join(root, 'marketing/launch/Hero.html'), '<p>taken</p>')

      const copy = await duplicateFrame(root, 'webapp/home/hero', {
        cwd: root,
        to: 'marketing/launch',
      })

      expect(copy).toMatchObject({
        ref: 'marketing/launch/hero-2',
        box: { x: 0, y: 0, width: 1440, height: 900 },
      })
    })

    it('duplicate fails name-taken under an explicit --name', async () => {
      const root = open()

      await expect(
        duplicateFrame(root, 'webapp/home/hero', {
          cwd: root,
          to: 'marketing/launch',
          name: 'Landing',
        }),
      ).rejects.toMatchObject({ code: 'name-taken' })
    })

    it('move --to carries the file and both entries', async () => {
      const root = open()

      const moved = await moveFrame(root, 'marketing/launch/landing', {
        cwd: root,
        to: 'webapp/home',
      })

      expect(moved).toMatchObject({ ref: 'webapp/home/landing', order: 2 })
      expect(existsSync(join(root, 'marketing/launch/landing.html'))).toBe(
        false,
      )
      expect(layout('marketing/launch').frames).toEqual({})
    })

    it('move --to takes -2 on a collision', async () => {
      const root = open()
      await duplicateFrame(root, 'marketing/launch/landing', {
        cwd: root,
        to: 'webapp/home',
      })

      const moved = await moveFrame(root, 'marketing/launch/landing', {
        cwd: root,
        to: 'webapp/home',
      })

      expect(moved.name).toBe('landing-2')
    })

    it('move --to leaves the file in place when the target layout is invalid', async () => {
      const root = open()
      writeFileSync(join(root, 'marketing/launch/layout.json'), '{')

      await expect(
        moveFrame(root, 'webapp/home/hero', {
          cwd: root,
          to: 'marketing/launch',
        }),
      ).rejects.toMatchObject({ code: 'layout-invalid', exitCode: 5 })
      expect(existsSync(join(root, 'webapp/home/hero.html'))).toBe(true)
      expect(file('marketing/launch/layout.json')).toBe('{')
    })

    it('rename fails name-taken on a name held in another case', async () => {
      const root = open()

      await expect(
        renameFrame(root, 'webapp/home/about', 'HERO', { cwd: root }),
      ).rejects.toMatchObject({ code: 'name-taken' })
    })

    it('rename moves the file and its entry', async () => {
      const root = open()

      await renameFrame(root, 'webapp/home/about', 'team', { cwd: root })

      expect(Object.keys(layout('webapp/home').frames).sort()).toEqual([
        'hero',
        'team',
      ])
      expect(existsSync(join(root, 'webapp/home/team.html'))).toBe(true)
    })

    it('delete removes the file and its entry', async () => {
      const root = open()

      expect(
        await deleteFrame(root, 'webapp/home/about', { cwd: root }),
      ).toEqual({ deleted: 'webapp/home/about' })
      expect(Object.keys(layout('webapp/home').frames)).toEqual(['hero'])
    })
  })

  describe('on the hand-made board', () => {
    it('add places an unplaced file at its listed box without touching it', async () => {
      board = copyFixtureBoard('hand-made')
      const root = board.root
      const bytes = file('sketches/drafts/loose.html')

      const added = await addFrame(root, 'drafts/loose', { cwd: root })

      expect(added).toMatchObject({
        box: { x: 2090, y: 0, width: 1440, height: 900 },
        placed: true,
      })
      expect(file('sketches/drafts/loose.html')).toBe(bytes)
    })

    it('keeps an orphan entry through a write', async () => {
      board = copyFixtureBoard('hand-made')
      const root = board.root

      await setFrameFlag(root, 'drafts/placed', 'hidden', {
        cwd: root,
        on: true,
      })

      expect(layout('sketches/drafts').frames.ghost).toBeDefined()
    })
  })

  describe('on the broken board', () => {
    it('refuses a write to an invalid layout and leaves its bytes', async () => {
      board = copyFixtureBoard('broken')
      const root = board.root

      await expect(
        moveFrame(root, 'home/hero', { cwd: root, x: 5 }),
      ).rejects.toMatchObject({ code: 'layout-invalid', exitCode: 5 })
      expect(file('wrecked/home/layout.json')).toBe('{\n')
    })
  })
})
