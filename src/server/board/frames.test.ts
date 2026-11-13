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
import { recordingJournal } from '../../../test/support/recording-journal'
import { reserve } from '../claims/store'
import {
  addFrame,
  deleteFrame,
  duplicateFrame,
  fitHeight,
  moveFrame,
  orderFrame,
  renameFrame,
  resizeFrame,
  setBoxes,
  setFrameDevice,
  setFrameFlag,
  setFrameTransition,
  setHeightModes,
  setMeasured,
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

    it('carries an unknown key through a rename', async () => {
      const root = open()
      const page = layout('webapp/home')
      page.frames.hero.tint = 'red'
      writeFileSync(join(root, 'webapp/home/layout.json'), JSON.stringify(page))

      await renameFrame(root, 'webapp/home/hero', 'banner', { cwd: root })

      expect(layout('webapp/home').frames.banner).toMatchObject({ tint: 'red' })
    })

    it('carries an unknown key through a move into another project', async () => {
      const root = open()
      const page = layout('webapp/home')
      page.frames.hero.tint = 'red'
      writeFileSync(join(root, 'webapp/home/layout.json'), JSON.stringify(page))

      await moveFrame(root, 'webapp/home/hero', {
        cwd: root,
        to: 'marketing/launch',
      })

      expect(layout('marketing/launch').frames.hero).toMatchObject({
        tint: 'red',
        order: 1,
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

    it('add with no position takes the box a live reservation holds', async () => {
      const root = open()
      await reserve(
        root,
        { session: 'sess-a', agent: 'claude', tag: 'claude · a' },
        [
          {
            frame: 'webapp/home/pricing',
            box: { x: 3000, y: 200, width: 400, height: 300, hugHeight: true },
          },
        ],
        new Date(),
      )

      const added = await addFrame(root, 'webapp/home/pricing', { cwd: root })

      expect(added).toMatchObject({
        box: { x: 3000, y: 200, width: 400, height: 300 },
        hugHeight: true,
        hugWidth: false,
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

  describe('setBoxes', () => {
    const HERO = { x: 0, y: 0, width: 1440, height: 900 }
    const ABOUT = { x: 1520, y: 0, width: 390, height: 844 }

    it('sets several boxes on one page and answers their records', async () => {
      board = copyFixtureBoard('hand-made')
      const root = board.root

      const frames = await setBoxes(
        root,
        'drafts',
        {
          placed: { x: 10, y: 20, width: 400, height: 300 },
          loose: { x: 900, y: 40, width: 1440, height: 900 },
        },
        {
          placed: { x: 100, y: 50, width: 390, height: 844 },
          loose: { x: 2090, y: 0, width: 1440, height: 900 },
        },
        { cwd: root },
      )

      expect(layout('sketches/drafts').frames).toMatchObject({
        placed: { x: 10, y: 20, width: 400, height: 300, order: 3 },
        loose: { x: 900, y: 40, width: 1440, height: 900 },
      })
      expect(frames).toHaveLength(2)
      expect(frames).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'loose', placed: true }),
          expect.objectContaining({ name: 'placed', placed: true }),
        ]),
      )
    })

    it('keeps an unknown key on an entry it sets', async () => {
      board = copyFixtureBoard('basic')
      const root = board.root
      const page = layout('webapp/home')
      page.frames.hero.tint = 'red'
      writeFileSync(join(root, 'webapp/home/layout.json'), JSON.stringify(page))

      await setBoxes(
        root,
        'webapp/home',
        { hero: { ...HERO, x: 64 } },
        { hero: HERO },
        { cwd: root },
      )

      expect(layout('webapp/home').frames.hero).toMatchObject({
        tint: 'red',
        x: 64,
      })
    })

    it('drops a linked width a hand resize lands the frame on', async () => {
      board = copyFixtureBoard('basic')
      const root = board.root
      const page = layout('webapp/home')
      page.frames.hero.widths = [
        { width: 834, height: 1194 },
        { width: 390, height: 844 },
      ]
      writeFileSync(join(root, 'webapp/home/layout.json'), JSON.stringify(page))

      await setBoxes(
        root,
        'webapp/home',
        { hero: { ...HERO, width: 834, height: 1194 } },
        { hero: HERO },
        { cwd: root },
      )

      expect(layout('webapp/home').frames.hero).toMatchObject({
        width: 834,
        widths: [{ width: 390, height: 844 }],
      })
    })

    it('refuses a locked frame and writes nothing', async () => {
      board = copyFixtureBoard('basic')
      const root = board.root
      await setFrameFlag(root, 'webapp/home/about', 'locked', {
        cwd: root,
        on: true,
      })
      const bytes = file('webapp/home/layout.json')

      await expect(
        setBoxes(
          root,
          'webapp/home',
          { hero: { ...HERO, x: 64 }, about: { ...ABOUT, x: 0 } },
          { hero: HERO, about: ABOUT },
          { cwd: root },
        ),
      ).rejects.toMatchObject({ code: 'frame-locked', exitCode: 11 })
      expect(file('webapp/home/layout.json')).toBe(bytes)
    })

    it('refuses a box that changed since the edit began and writes nothing', async () => {
      board = copyFixtureBoard('basic')
      const root = board.root
      await moveFrame(root, 'webapp/home/hero', { cwd: root, x: 5 })
      const bytes = file('webapp/home/layout.json')

      await expect(
        setBoxes(
          root,
          'webapp/home',
          { hero: { ...HERO, x: 64 } },
          { hero: HERO },
          { cwd: root },
        ),
      ).rejects.toMatchObject({
        code: 'stale-layout',
        details: { stored: { ...HERO, x: 5 } },
      })
      expect(file('webapp/home/layout.json')).toBe(bytes)
    })

    it('refuses a frame the page does not hold', async () => {
      board = copyFixtureBoard('basic')
      const root = board.root

      await expect(
        setBoxes(
          root,
          'webapp/home',
          { nowhere: HERO },
          { nowhere: HERO },
          { cwd: root },
        ),
      ).rejects.toMatchObject({ code: 'frame-not-found' })
    })
  })

  describe('hugging', () => {
    const HERO = { x: 0, y: 0, width: 1440, height: 900 }

    function open(): string {
      board = copyFixtureBoard('basic')
      return board.root
    }

    function hugHero(root: string, flags: object): void {
      const page = layout('webapp/home')
      Object.assign(page.frames.hero, flags)
      writeFileSync(join(root, 'webapp/home/layout.json'), JSON.stringify(page))
    }

    it.each([
      ['no size', {}, [true, true]],
      ['a preset', { size: 'phone' }, [false, true]],
      ['a width', { width: 320 }, [false, true]],
      ['a height', { height: 200 }, [true, false]],
      ['a width and a height', { width: 320, height: 200 }, [false, false]],
    ] as const)('add with %s hugs %j', async (_label, size, hugs) => {
      const root = open()

      const added = await addFrame(root, 'webapp/home/card', {
        cwd: root,
        ...size,
      })

      expect([added.hugWidth, added.hugHeight]).toEqual(hugs)
      expect(layout('webapp/home').frames.card).toMatchObject({
        hugWidth: hugs[0],
        hugHeight: hugs[1],
      })
    })

    it('add with no size keeps the desktop box as its placeholder', async () => {
      const root = open()

      const added = await addFrame(root, 'webapp/home/card', { cwd: root })

      expect(added.box).toMatchObject({ width: 1440, height: 900 })
    })

    it('a write to an entry from before the flags adds no hug key', async () => {
      const root = open()

      await moveFrame(root, 'webapp/home/hero', { cwd: root, x: 40 })

      expect(Object.keys(layout('webapp/home').frames.hero)).toEqual([
        'x',
        'y',
        'width',
        'height',
        'order',
        'hidden',
        'locked',
      ])
    })

    it('reads a scroll entry holding both hug flags as fixed', async () => {
      const root = open()
      hugHero(root, { scroll: true, hugWidth: true, hugHeight: true })

      const moved = await moveFrame(root, 'webapp/home/hero', {
        cwd: root,
        x: 40,
      })

      expect(moved).toMatchObject({
        scroll: true,
        hugWidth: false,
        hugHeight: false,
      })
      expect(layout('webapp/home').frames.hero).toMatchObject({
        scroll: true,
        hugWidth: false,
        hugHeight: false,
      })
    })

    it('a write to an entry without the key adds no scroll key', async () => {
      const root = open()
      hugHero(root, { hugHeight: true })

      await moveFrame(root, 'webapp/home/hero', { cwd: root, x: 40 })

      expect(layout('webapp/home').frames.hero).not.toHaveProperty('scroll')
    })

    it('resize fixes the axis it sets and leaves the other hugging', async () => {
      const root = open()
      hugHero(root, { hugWidth: true, hugHeight: true })

      const resized = await resizeFrame(root, 'webapp/home/hero', {
        cwd: root,
        height: 500,
      })

      expect([resized.hugWidth, resized.hugHeight]).toEqual([true, false])
    })

    describe('scroll', () => {
      it('add at a preset holds its size and hugs neither axis', async () => {
        const root = open()

        const added = await addFrame(root, 'webapp/home/card', {
          cwd: root,
          size: 'phone',
          scroll: true,
        })

        expect(added).toMatchObject({
          box: { width: 390, height: 844 },
          hugWidth: false,
          hugHeight: false,
          scroll: true,
        })
        expect(layout('webapp/home').frames.card).toMatchObject({
          scroll: true,
          hugWidth: false,
          hugHeight: false,
        })
      })

      it('add with a width alone takes the reference height', async () => {
        const root = open()

        const added = await addFrame(root, 'webapp/home/card', {
          cwd: root,
          width: 1440,
          scroll: true,
        })

        expect(added.box).toMatchObject({ width: 1440, height: 900 })
      })

      it('add with a height keeps the height given', async () => {
        const root = open()

        const added = await addFrame(root, 'webapp/home/card', {
          cwd: root,
          width: 390,
          height: 700,
          scroll: true,
        })

        expect(added.box).toMatchObject({ width: 390, height: 700 })
      })

      it('add without it writes no scroll key', async () => {
        const root = open()

        await addFrame(root, 'webapp/home/card', { cwd: root, size: 'phone' })

        expect(layout('webapp/home').frames.card).not.toHaveProperty('scroll')
      })

      it('resize on drops a hugging height to the reference height', async () => {
        const root = open()
        hugHero(root, { height: 3816, hugHeight: true })

        const resized = await resizeFrame(root, 'webapp/home/hero', {
          cwd: root,
          scroll: true,
        })

        expect(resized).toMatchObject({
          box: { width: 1440, height: 900 },
          hugHeight: false,
          scroll: true,
        })
      })

      it('resize on keeps a fixed height', async () => {
        const root = open()
        hugHero(root, { height: 1200 })

        const resized = await resizeFrame(root, 'webapp/home/hero', {
          cwd: root,
          scroll: true,
        })

        expect(resized.box.height).toBe(1200)
      })

      it('resize off clears the key and keeps the box fixed', async () => {
        const root = open()
        hugHero(root, { scroll: true })

        const resized = await resizeFrame(root, 'webapp/home/hero', {
          cwd: root,
          scroll: false,
        })

        expect(resized).toMatchObject({
          box: HERO,
          hugWidth: false,
          hugHeight: false,
          scroll: false,
        })
      })

      it('resize with neither a size nor the flag refuses usage', async () => {
        const root = open()

        await expect(
          resizeFrame(root, 'webapp/home/hero', { cwd: root }),
        ).rejects.toMatchObject({ code: 'usage' })
      })

      it('duplicate keeps the key on the copy', async () => {
        const root = open()
        hugHero(root, { scroll: true })

        const copy = await duplicateFrame(root, 'webapp/home/hero', {
          cwd: root,
        })

        expect(copy.scroll).toBe(true)
        expect(layout('webapp/home').frames[copy.name]).toMatchObject({
          scroll: true,
        })
      })

      it('fitHeight refuses fit-scroll and writes nothing', async () => {
        const root = open()
        hugHero(root, { scroll: true })
        const bytes = file('webapp/home/layout.json')

        await expect(
          fitHeight(root, 'webapp/home/hero', 3816, { cwd: root }),
        ).rejects.toMatchObject({ code: 'fit-scroll' })
        expect(file('webapp/home/layout.json')).toBe(bytes)
      })

      it('setHeightModes to scroll with a target height takes that height', async () => {
        const root = open()
        hugHero(root, { height: 1992, hugHeight: true })

        const [set] = await setHeightModes(
          root,
          [{ ref: 'webapp/home/hero', expected: HERO, height: 1100 }],
          'scroll',
          { cwd: root },
        )

        expect(set).toMatchObject({
          box: { width: 1440, height: 1100 },
          hugHeight: false,
          scroll: true,
        })
      })

      it('setHeightModes to scroll with no target height drops a hug to the reference height', async () => {
        const root = open()
        hugHero(root, { height: 1992, hugHeight: true })

        const [set] = await setHeightModes(
          root,
          [{ ref: 'webapp/home/hero', expected: HERO }],
          'scroll',
          { cwd: root },
        )

        expect(set).toMatchObject({
          box: { width: 1440, height: 900 },
          scroll: true,
        })
      })
    })

    describe('device', () => {
      it('sets a device on the entry and leaves the frame file alone', async () => {
        const root = open()
        const bytes = file('webapp/home/hero.html')

        const set = await setFrameDevice(root, 'webapp/home/hero', 'phone', {
          cwd: root,
        })

        expect(set.device).toBe('phone')
        expect(layout('webapp/home').frames.hero.device).toBe('phone')
        expect(file('webapp/home/hero.html')).toBe(bytes)
      })

      it('clears a device, leaving no key and the frame file alone', async () => {
        const root = open()
        const bytes = file('webapp/home/hero.html')
        await setFrameDevice(root, 'webapp/home/hero', 'tablet', { cwd: root })

        const cleared = await setFrameDevice(root, 'webapp/home/hero', null, {
          cwd: root,
        })

        expect(cleared).not.toHaveProperty('device')
        expect(layout('webapp/home').frames.hero).not.toHaveProperty('device')
        expect(file('webapp/home/hero.html')).toBe(bytes)
      })

      it('reads an unknown value as none and leaves it as written', async () => {
        const root = open()
        hugHero(root, { device: 'watch' })

        const moved = await moveFrame(root, 'webapp/home/hero', {
          cwd: root,
          x: 40,
        })

        expect(moved).not.toHaveProperty('device')
        expect(layout('webapp/home').frames.hero.device).toBe('watch')
      })

      it('add writes the device it is given', async () => {
        const root = open()

        const added = await addFrame(root, 'webapp/home/card', {
          cwd: root,
          size: 'phone',
          device: 'phone',
        })

        expect(added.device).toBe('phone')
        expect(layout('webapp/home').frames.card.device).toBe('phone')
      })

      it('duplicate lands 80 past the bezel of a frame in a device', async () => {
        const root = open()
        await setFrameDevice(root, 'webapp/home/about', 'tablet', { cwd: root })

        const copy = await duplicateFrame(root, 'webapp/home/about', {
          cwd: root,
        })

        expect(copy.box.x).toBe(1520 + 390 + 44 + 80)
      })
    })

    describe('transition', () => {
      it('sets an override on the entry and leaves the frame file alone', async () => {
        const root = open()
        const bytes = file('webapp/home/hero.html')

        const set = await setFrameTransition(
          root,
          'webapp/home/hero',
          { name: 'push', direction: 'up' },
          { cwd: root },
        )

        expect(set.transition).toEqual({ name: 'push', direction: 'up' })
        expect(layout('webapp/home').frames.hero.transition).toEqual({
          name: 'push',
          direction: 'up',
        })
        expect(file('webapp/home/hero.html')).toBe(bytes)
      })

      it('clears an override, leaving no key and the frame file alone', async () => {
        const root = open()
        const bytes = file('webapp/home/hero.html')
        await setFrameTransition(
          root,
          'webapp/home/hero',
          { name: 'fade' },
          { cwd: root },
        )

        const cleared = await setFrameTransition(
          root,
          'webapp/home/hero',
          null,
          { cwd: root },
        )

        expect(cleared).not.toHaveProperty('transition')
        expect(layout('webapp/home').frames.hero).not.toHaveProperty(
          'transition',
        )
        expect(file('webapp/home/hero.html')).toBe(bytes)
      })

      it('reads an unknown transition as none and leaves it as written', async () => {
        const root = open()
        hugHero(root, { transition: { name: 'cube' } })

        const moved = await moveFrame(root, 'webapp/home/hero', {
          cwd: root,
          x: 40,
        })

        expect(moved).not.toHaveProperty('transition')
        expect(layout('webapp/home').frames.hero.transition).toEqual({
          name: 'cube',
        })
      })
    })

    it('fitHeight sets the height and turns its hugging back on', async () => {
      const root = open()

      const fit = await fitHeight(root, 'webapp/home/hero', 1232, { cwd: root })

      expect(fit).toMatchObject({
        box: { height: 1232 },
        hugWidth: false,
        hugHeight: true,
      })
    })

    describe('widths', () => {
      it('add writes each width at the reference height of its width', async () => {
        const root = open()

        const added = await addFrame(root, 'webapp/home/card', {
          cwd: root,
          size: 'desktop',
          widths: [834, 390],
        })

        const widths = [
          { width: 834, height: 1194 },
          { width: 390, height: 844 },
        ]
        expect(added.widths).toEqual(widths)
        expect(layout('webapp/home').frames.card.widths).toEqual(widths)
      })

      it('add refuses usage on a frame hugging its width, writing no file', async () => {
        const root = open()

        await expect(
          addFrame(root, 'webapp/home/card', { cwd: root, widths: [390] }),
        ).rejects.toMatchObject({ code: 'usage' })
        expect(existsSync(join(root, 'webapp/home/card.html'))).toBe(false)
      })

      it.each([
        ['a repeated width', { widths: [390, 390] }],
        ['its own width', { widths: [1440, 390] }],
        ['a width it already lists', { width: 390 }],
      ])('resize refuses usage on %s', async (_, options) => {
        const root = open()
        await resizeFrame(root, 'webapp/home/hero', {
          cwd: root,
          widths: [390],
        })
        const bytes = file('webapp/home/layout.json')

        await expect(
          resizeFrame(root, 'webapp/home/hero', { cwd: root, ...options }),
        ).rejects.toMatchObject({ code: 'usage' })
        expect(file('webapp/home/layout.json')).toBe(bytes)
      })

      it('resize keeps the height a listed width held and adds a new one at its reference height', async () => {
        const root = open()
        hugHero(root, { widths: [{ width: 390, height: 2000 }] })

        const resized = await resizeFrame(root, 'webapp/home/hero', {
          cwd: root,
          widths: [834, 390],
        })

        expect(resized.widths).toEqual([
          { width: 834, height: 1194 },
          { width: 390, height: 2000 },
        ])
      })

      it('resize with false removes the key', async () => {
        const root = open()
        await resizeFrame(root, 'webapp/home/hero', {
          cwd: root,
          widths: [390],
        })

        const resized = await resizeFrame(root, 'webapp/home/hero', {
          cwd: root,
          widths: false,
        })

        expect(resized.widths).toEqual([])
        expect(layout('webapp/home').frames.hero).not.toHaveProperty('widths')
      })

      it('resize turning scroll on drops each linked height to its reference height', async () => {
        const root = open()
        hugHero(root, {
          hugHeight: true,
          height: 3000,
          widths: [{ width: 390, height: 5000 }],
        })

        const resized = await resizeFrame(root, 'webapp/home/hero', {
          cwd: root,
          scroll: true,
        })

        expect(resized.widths).toEqual([{ width: 390, height: 844 }])
      })

      it('resize turning scroll on with a height still drops each linked height', async () => {
        const root = open()
        hugHero(root, {
          hugHeight: true,
          height: 3000,
          widths: [{ width: 390, height: 5000 }],
        })

        const resized = await resizeFrame(root, 'webapp/home/hero', {
          cwd: root,
          scroll: true,
          height: 900,
        })

        expect([resized.box.height, resized.widths]).toEqual([
          900,
          [{ width: 390, height: 844 }],
        ])
      })

      it('resize fixing the height keeps each linked height', async () => {
        const root = open()
        hugHero(root, {
          hugHeight: true,
          widths: [{ width: 390, height: 5000 }],
        })

        const resized = await resizeFrame(root, 'webapp/home/hero', {
          cwd: root,
          height: 700,
        })

        expect(resized.widths).toEqual([{ width: 390, height: 5000 }])
      })

      it('duplicate carries the list and lands past the row it draws', async () => {
        const root = open()
        hugHero(root, { widths: [{ width: 390, height: 844 }] })

        const copy = await duplicateFrame(root, 'webapp/home/hero', {
          cwd: root,
        })

        expect(copy.box.x).toBe(1990)
        expect(layout('webapp/home').frames['hero-2'].widths).toEqual([
          { width: 390, height: 844 },
        ])
      })

      it('move keeps a value no reader understands as written', async () => {
        const root = open()
        hugHero(root, { widths: '834,390' })

        await moveFrame(root, 'webapp/home/hero', { cwd: root, x: 40 })

        expect(layout('webapp/home').frames.hero.widths).toBe('834,390')
      })
    })

    describe('setMeasured', () => {
      it('writes each linked height a hugging frame still lists', async () => {
        const root = open()
        hugHero(root, {
          hugHeight: true,
          widths: [
            { width: 834, height: 1194 },
            { width: 390, height: 844 },
          ],
        })

        const written = await setMeasured(
          root,
          'webapp/home',
          {
            hero: {
              widths: [
                { width: 390, height: 2400 },
                { width: 320, height: 3000 },
              ],
            },
          },
          { cwd: root },
        )

        expect(written).toEqual(['hero'])
        expect(layout('webapp/home').frames.hero).toMatchObject({
          height: 900,
          widths: [
            { width: 834, height: 1194 },
            { width: 390, height: 2400 },
          ],
        })
      })

      it('leaves the linked heights of a fixed frame', async () => {
        const root = open()
        hugHero(root, { widths: [{ width: 390, height: 844 }] })
        const bytes = file('webapp/home/layout.json')

        const written = await setMeasured(
          root,
          'webapp/home',
          { hero: { widths: [{ width: 390, height: 2400 }] } },
          { cwd: root },
        )

        expect(written).toEqual([])
        expect(file('webapp/home/layout.json')).toBe(bytes)
      })

      it('writes a hugging axis and leaves a fixed one', async () => {
        const root = open()
        hugHero(root, { hugHeight: true })

        const written = await setMeasured(
          root,
          'webapp/home',
          { hero: { width: 320, height: 1232 } },
          { cwd: root },
        )

        expect(written).toEqual(['hero'])
        expect(layout('webapp/home').frames.hero).toMatchObject({
          width: 1440,
          height: 1232,
          hugHeight: true,
        })
      })

      it('writes nothing to a frame that does not hug', async () => {
        const root = open()
        const bytes = file('webapp/home/layout.json')

        const written = await setMeasured(
          root,
          'webapp/home',
          { hero: { width: 320, height: 1232 } },
          { cwd: root },
        )

        expect(written).toEqual([])
        expect(file('webapp/home/layout.json')).toBe(bytes)
      })

      it('leaves a scroll entry an older fit left hugging', async () => {
        const root = open()
        hugHero(root, { scroll: true, hugHeight: true })
        const bytes = file('webapp/home/layout.json')

        const written = await setMeasured(
          root,
          'webapp/home',
          { hero: { width: 1440, height: 3816 } },
          { cwd: root },
        )

        expect(written).toEqual([])
        expect(file('webapp/home/layout.json')).toBe(bytes)
      })

      it('writes nothing when the measured size already stands', async () => {
        const root = open()
        hugHero(root, { hugHeight: true })
        const bytes = file('webapp/home/layout.json')

        const written = await setMeasured(
          root,
          'webapp/home',
          { hero: { width: 1440, height: 900 } },
          { cwd: root },
        )

        expect(written).toEqual([])
        expect(file('webapp/home/layout.json')).toBe(bytes)
      })
    })

    describe('setBoxes on a hugging frame', () => {
      it('moves it after the server measured, keeping the measured height', async () => {
        const root = open()
        hugHero(root, { hugHeight: true })
        await setMeasured(
          root,
          'webapp/home',
          { hero: { width: 1440, height: 1232 } },
          { cwd: root },
        )

        await setBoxes(
          root,
          'webapp/home',
          { hero: { ...HERO, x: 64 } },
          { hero: HERO },
          { cwd: root },
        )

        expect(layout('webapp/home').frames.hero).toMatchObject({
          x: 64,
          height: 1232,
          hugHeight: true,
        })
      })

      it('fixes the axis a hand resize changes', async () => {
        const root = open()
        hugHero(root, { hugWidth: true, hugHeight: true })

        await setBoxes(
          root,
          'webapp/home',
          { hero: { ...HERO, height: 600 } },
          { hero: HERO },
          { cwd: root },
        )

        expect(layout('webapp/home').frames.hero).toMatchObject({
          height: 600,
          hugWidth: true,
          hugHeight: false,
        })
      })
    })
  })

  describe('on the hand-made board', () => {
    it('add places an unplaced file past the placed frames without touching it', async () => {
      board = copyFixtureBoard('hand-made')
      const root = board.root
      const bytes = file('sketches/drafts/loose.html')

      const added = await addFrame(root, 'drafts/loose', { cwd: root })

      expect(added).toMatchObject({
        box: { x: 570, y: 0, width: 1440, height: 900 },
        placed: true,
      })
      expect(file('sketches/drafts/loose.html')).toBe(bytes)
    })

    it('add places one of two written files beside the first placed, past no other unplaced file', async () => {
      board = copyFixtureBoard('hand-made')
      const root = board.root
      writeFileSync(join(root, 'sketches/ideas/third.html'), '<main></main>')
      await addFrame(root, 'ideas/second', { cwd: root, size: 'phone' })

      const added = await addFrame(root, 'ideas/third', {
        cwd: root,
        size: 'phone',
      })

      expect(added.box).toMatchObject({ x: 470, y: 0 })
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

  describe('with a journal', () => {
    const HERO = { x: 0, y: 0, width: 1440, height: 900 }
    const heroEntry = { ...HERO, order: 0, hidden: false, locked: false }

    it('move reports the one entry it changed', async () => {
      board = copyFixtureBoard('basic')
      const { journal, calls } = recordingJournal(board.root)

      await moveFrame(board.root, 'webapp/home/hero', {
        cwd: board.root,
        x: 40,
        journal,
      })

      expect(calls).toEqual([
        {
          kind: 'entry',
          page: 'webapp/home',
          frame: 'hero',
          before: heroEntry,
          after: { ...heroEntry, x: 40 },
        },
      ])
    })

    it('setBoxes reports each box it set', async () => {
      board = copyFixtureBoard('basic')
      const { journal, calls } = recordingJournal(board.root)

      await setBoxes(
        board.root,
        'webapp/home',
        { hero: { ...HERO, y: 30 } },
        { hero: HERO },
        { cwd: board.root, journal },
      )

      expect(calls).toEqual([
        {
          kind: 'entry',
          page: 'webapp/home',
          frame: 'hero',
          before: heroEntry,
          after: { ...heroEntry, y: 30 },
        },
      ])
    })

    it('setBoxes reports nothing when it refuses', async () => {
      board = copyFixtureBoard('basic')
      const { journal, calls } = recordingJournal(board.root)

      await expect(
        setBoxes(
          board.root,
          'webapp/home',
          { hero: { ...HERO, y: 30 } },
          { hero: { ...HERO, x: 5 } },
          { cwd: board.root, journal },
        ),
      ).rejects.toMatchObject({ code: 'stale-layout' })
      expect(calls).toEqual([])
    })

    it('add reports the file it created and the entry it placed', async () => {
      board = copyFixtureBoard('basic')
      const { journal, calls } = recordingJournal(board.root)

      await addFrame(board.root, 'webapp/settings/new', {
        cwd: board.root,
        journal,
      })

      expect(calls.map((call) => call.kind)).toEqual(['created', 'entry'])
      expect(calls[0]).toEqual({
        kind: 'created',
        path: 'webapp/settings/new.html',
      })
      expect(calls[1]).toMatchObject({ frame: 'new', before: undefined })
    })

    it('rename moves the file through the journal and reports both entries', async () => {
      board = copyFixtureBoard('basic')
      const { journal, calls } = recordingJournal(board.root)

      await renameFrame(board.root, 'webapp/home/hero', 'banner', {
        cwd: board.root,
        journal,
      })

      expect(calls).toEqual([
        {
          kind: 'moved',
          from: 'webapp/home/hero.html',
          to: 'webapp/home/banner.html',
        },
        {
          kind: 'entry',
          page: 'webapp/home',
          frame: 'hero',
          before: heroEntry,
          after: undefined,
        },
        {
          kind: 'entry',
          page: 'webapp/home',
          frame: 'banner',
          before: undefined,
          after: heroEntry,
        },
      ])
    })

    it('delete takes the file out through the journal', async () => {
      board = copyFixtureBoard('basic')
      const { journal, calls } = recordingJournal(board.root)

      await deleteFrame(board.root, 'webapp/home/hero', {
        cwd: board.root,
        journal,
      })

      expect(calls[0]).toEqual({
        kind: 'removed',
        path: 'webapp/home/hero.html',
      })
      expect(calls.slice(1)).toContainEqual({
        kind: 'entry',
        page: 'webapp/home',
        frame: 'hero',
        before: heroEntry,
        after: undefined,
      })
    })

    it('duplicate reports the copy it created', async () => {
      board = copyFixtureBoard('basic')
      const { journal, calls } = recordingJournal(board.root)

      await duplicateFrame(board.root, 'webapp/home/hero', {
        cwd: board.root,
        journal,
      })

      expect(calls[0]).toEqual({
        kind: 'created',
        path: 'webapp/home/hero-2.html',
      })
    })

    it('writes the same layout bytes as a write with no journal', async () => {
      board = copyFixtureBoard('basic')
      const plain = copyFixtureBoard('basic')
      try {
        await moveFrame(plain.root, 'webapp/home/hero', {
          cwd: plain.root,
          x: 40,
        })
        await moveFrame(board.root, 'webapp/home/hero', {
          cwd: board.root,
          x: 40,
          journal: recordingJournal(board.root).journal,
        })

        expect(file('webapp/home/layout.json')).toBe(
          readFileSync(join(plain.root, 'webapp/home/layout.json'), 'utf8'),
        )
      } finally {
        plain.cleanup()
      }
    })
  })
})
