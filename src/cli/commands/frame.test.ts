import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { frameRecordSchema, listResultSchema } from '@/shared/records/list'

import { cli } from '../../../test/support/cli'
import {
  copyFixtureBoard,
  type FixtureBoard,
  type FixtureBoardName,
} from '../../../test/support/fixture-board'

describe('frame', () => {
  let board: FixtureBoard

  afterEach(() => {
    board.cleanup()
  })

  function on(name: FixtureBoardName) {
    board = copyFixtureBoard(name)
    return (...argv: string[]) => cli([...argv, '--json'], { cwd: board.root })
  }

  it.each([
    ['add', ['webapp/home/pricing', '--size', 'phone']],
    ['duplicate', ['webapp/home/hero', '--to', 'marketing/launch']],
    ['move', ['webapp/home/hero', '--x', '-40', '--y', '20']],
    ['resize', ['webapp/home/hero', '--width', '1280']],
    ['order', ['webapp/home/hero', '--index', '1']],
    ['rename', ['webapp/home/hero', 'banner']],
    ['hide', ['webapp/home/hero']],
    ['lock', ['webapp/home/about', '--off']],
  ])('%s returns the frame record', async (verb, args) => {
    const run = on('basic')

    const result = await run('frame', verb, ...args)

    expect(result.exitCode).toBe(0)
    expect(frameRecordSchema.safeParse(result.json().data).success).toBe(true)
  })

  it('fit refuses frame-not-found, exit 3, ahead of launching a browser', async () => {
    const run = on('basic')

    const result = await run('frame', 'fit', 'webapp/home/missing')

    expect(result.exitCode).toBe(3)
    expect(result.json().error?.code).toBe('frame-not-found')
  })

  describe('scroll', () => {
    it('add --scroll at a preset holds the size and hugs neither axis', async () => {
      const run = on('basic')

      const result = await run(
        'frame',
        'add',
        'webapp/home/pricing',
        '--size',
        'phone',
        '--scroll',
      )

      expect(result.json().data).toMatchObject({
        box: { width: 390, height: 844 },
        hugWidth: false,
        hugHeight: false,
        scroll: true,
      })
    })

    it('resize --scroll with no size sets the key', async () => {
      const run = on('basic')

      const result = await run(
        'frame',
        'resize',
        'webapp/home/hero',
        '--scroll',
      )

      expect(result.exitCode).toBe(0)
      expect(result.json().data).toMatchObject({ scroll: true })
    })

    it('resize --no-scroll clears it', async () => {
      const run = on('basic')
      await run('frame', 'resize', 'webapp/home/hero', '--scroll')

      const result = await run(
        'frame',
        'resize',
        'webapp/home/hero',
        '--no-scroll',
      )

      expect(result.json().data).toMatchObject({ scroll: false })
    })

    it('resize with no size and no flag fails usage, exit 2', async () => {
      const run = on('basic')

      const result = await run('frame', 'resize', 'webapp/home/hero')

      expect(result.exitCode).toBe(2)
      expect(result.json().error?.code).toBe('usage')
    })

    it('fit refuses fit-scroll, exit 10, ahead of launching a browser', async () => {
      const run = on('basic')
      await run('frame', 'resize', 'webapp/home/hero', '--scroll')

      const result = await run('frame', 'fit', 'webapp/home/hero')

      expect(result.exitCode).toBe(10)
      expect(result.json().error?.code).toBe('fit-scroll')
    })
  })

  describe('widths', () => {
    it('add --widths writes each width beside the frame', async () => {
      const run = on('basic')

      const result = await run(
        'frame',
        'add',
        'webapp/home/pricing',
        '--size',
        'desktop',
        '--widths',
        '834,390',
      )

      expect(result.json().data).toMatchObject({
        widths: [
          { width: 834, height: 1194 },
          { width: 390, height: 844 },
        ],
      })
    })

    it.each([
      [
        'a width that is not a number',
        ['--size', 'desktop', '--widths', '834,wide'],
      ],
      ['a zero width', ['--size', 'desktop', '--widths', '0']],
      ['a repeated width', ['--size', 'desktop', '--widths', '390,390']],
      ['its own width', ['--size', 'desktop', '--widths', '1440']],
      ['a frame hugging its width', ['--widths', '390']],
    ])('add refuses %s, exit 2', async (_, args) => {
      const run = on('basic')

      const result = await run('frame', 'add', 'webapp/home/pricing', ...args)

      expect(result.exitCode).toBe(2)
      expect(result.json().error?.code).toBe('usage')
    })

    it('resize --no-widths clears the list', async () => {
      const run = on('basic')
      await run('frame', 'resize', 'webapp/home/hero', '--widths', '390')

      const result = await run(
        'frame',
        'resize',
        'webapp/home/hero',
        '--no-widths',
      )

      expect(result.json().data).toMatchObject({ widths: [] })
    })
  })

  it('lock --off clears the flag', async () => {
    const run = on('basic')
    const locked = await run('frame', 'lock', 'webapp/home/about')
    expect(locked.json().data).toMatchObject({ locked: true })

    const result = await run('frame', 'lock', 'webapp/home/about', '--off')

    expect(result.json().data).toMatchObject({ locked: false })
  })

  it('delete returns what it deleted', async () => {
    const run = on('basic')

    const result = await run('frame', 'delete', 'webapp/home/about')

    expect(result.json()).toEqual({
      ok: true,
      data: { deleted: 'webapp/home/about' },
    })
  })

  it('fails frame-not-found, exit 3', async () => {
    const run = on('basic')

    const result = await run(
      'frame',
      'resize',
      'webapp/home/nowhere',
      '--size',
      'phone',
    )

    expect(result.exitCode).toBe(3)
    expect(result.json().error?.code).toBe('frame-not-found')
  })

  it('fails usage, exit 2, when the ref and --project disagree, writing nothing', async () => {
    const run = on('basic')
    const before = readFileSync(
      join(board.root, 'webapp/home/layout.json'),
      'utf8',
    )

    const result = await run(
      'frame',
      'move',
      'webapp/home/hero',
      '--project',
      'marketing',
      '--x',
      '9',
    )

    expect(result.exitCode).toBe(2)
    expect(result.json().error?.code).toBe('usage')
    expect(
      readFileSync(join(board.root, 'webapp/home/layout.json'), 'utf8'),
    ).toBe(before)
  })

  it.each([
    ['iphone-16', 393, 852],
    ['phone', 390, 844],
    ['tablet', 834, 1194],
    ['desktop', 1440, 900],
    ['slide-16-9', 1920, 1080],
    ['slide-4-3', 1024, 768],
    ['og-card', 1200, 630],
    ['linkedin-post', 1200, 627],
    ['video-portrait', 1080, 1920],
  ])('add --size %s places %i x %i', async (size, width, height) => {
    const run = on('basic')

    const result = await run(
      'frame',
      'add',
      'webapp/home/pricing',
      '--size',
      size,
    )

    expect(result.json().data).toMatchObject({ box: { width, height } })
  })

  describe('add with a -<px> name', () => {
    it('takes the width from the name, hugs the height, and shows the device', async () => {
      const run = on('basic')

      const result = await run('frame', 'add', 'webapp/home/pricing-390')

      expect(result.json().data).toMatchObject({
        box: { width: 390 },
        hugWidth: false,
        hugHeight: true,
        showDevice: true,
        device: 'phone',
      })
    })

    it.each([
      ['pricing-834', 834, 'tablet'],
      ['pricing-1440', 1440, 'laptop'],
    ])('lands %s %i wide in a %s', async (name, width, device) => {
      const run = on('basic')

      const result = await run('frame', 'add', `webapp/home/${name}`)

      expect(result.json().data).toMatchObject({ box: { width }, device })
    })

    it('hugs both axes with no device when the suffix names no width', async () => {
      const run = on('basic')

      const result = await run('frame', 'add', 'webapp/home/pricing-2')

      expect(result.json().data).toMatchObject({
        hugWidth: true,
        hugHeight: true,
      })
      expect(result.json().data).not.toHaveProperty('showDevice')
    })

    it.each([
      [
        '--size',
        ['--size', 'tablet'],
        { box: { width: 834 }, hugWidth: false },
      ],
      [
        '--width',
        ['--width', '1280'],
        { box: { width: 1280 }, hugWidth: false },
      ],
      [
        '--height',
        ['--height', '600'],
        { box: { width: 1440, height: 600 }, hugWidth: true },
      ],
    ])('takes %s over the name', async (_flag, args, landed) => {
      const run = on('basic')

      const result = await run(
        'frame',
        'add',
        'webapp/home/pricing-390',
        ...args,
      )

      expect(result.json().data).toMatchObject(landed)
      expect(result.json().data).not.toHaveProperty('showDevice')
    })

    it('keeps the box a reservation holds over the name', async () => {
      const run = on('basic')
      await run(
        'editing',
        'webapp/home/pricing-390',
        '--new',
        '--size',
        'tablet',
        '--session',
        'sess-a',
      )

      const result = await run('frame', 'add', 'webapp/home/pricing-390')

      expect(result.json().data).toMatchObject({ box: { width: 834 } })
      expect(result.json().data).not.toHaveProperty('showDevice')
    })

    it('lands in the box and device a reservation took from the name', async () => {
      const run = on('basic')
      const ref = 'webapp/home/pricing-390'
      await run('editing', ref, '--new', '--x', '-500', '--session', 'sess-a')

      const result = await run('frame', 'add', ref)

      expect(result.json().data).toMatchObject({
        box: { x: -500, width: 390 },
        hugWidth: false,
        hugHeight: true,
        device: 'phone',
      })
    })

    it('takes a size flag over the device a reservation took from the name', async () => {
      const run = on('basic')
      const ref = 'webapp/home/pricing-390'
      await run('editing', ref, '--new', '--session', 'sess-a')

      const result = await run('frame', 'add', ref, '--size', 'tablet')

      expect(result.json().data).toMatchObject({ box: { width: 834 } })
      expect(result.json().data).not.toHaveProperty('showDevice')
    })

    it('holds a --scroll frame at the screen height of a reservation by name', async () => {
      const run = on('basic')
      const ref = 'webapp/home/pricing-390'
      await run('editing', ref, '--new', '--session', 'sess-a')

      const result = await run('frame', 'add', ref, '--scroll')

      expect(result.json().data).toMatchObject({
        box: { width: 390, height: 844 },
        device: 'phone',
      })
    })

    it('lands past the last frame with room for its body', async () => {
      const run = on('basic')

      const result = await run('frame', 'add', 'webapp/home/pricing-390')

      expect(result.json().data).toMatchObject({ box: { x: 2010 } })
    })

    it('lands with no room for a body where --width shows none', async () => {
      const run = on('basic')

      const result = await run(
        'frame',
        'add',
        'webapp/home/pricing-390',
        '--width',
        '390',
      )

      expect(result.json().data).toMatchObject({ box: { x: 1990 } })
    })

    it('keeps the width and hidden device an entry left by a missing file holds', async () => {
      const run = on('basic')
      const ref = 'webapp/home/pricing-390'
      await run('frame', 'add', ref)
      await run('frame', 'resize', ref, '--width', '402')
      await run('frame', 'device', ref, 'off')
      rmSync(join(board.root, `${ref}.html`))

      const result = await run('frame', 'add', ref, '--scroll')

      expect(result.json().data).toMatchObject({ box: { width: 402 } })
      expect(result.json().data).not.toHaveProperty('showDevice')
    })

    it('keeps the turned box an entry left by a missing file holds', async () => {
      const run = on('basic')
      const ref = 'webapp/home/pricing-390'
      await run('frame', 'add', ref)
      await run('frame', 'device', ref, '--turn', 'left')
      rmSync(join(board.root, `${ref}.html`))

      const result = await run('frame', 'add', ref)

      expect(result.json().data).toMatchObject({
        box: { width: 844, height: 390 },
        turn: 'left',
      })
    })

    it('holds a --scroll frame at the screen height of the named width', async () => {
      const run = on('basic')

      const result = await run(
        'frame',
        'add',
        'webapp/home/pricing-390',
        '--scroll',
      )

      expect(result.json().data).toMatchObject({
        box: { width: 390, height: 844 },
        scroll: true,
        device: 'phone',
      })
    })

    it('takes --device beside the name as the same device', async () => {
      const run = on('basic')

      const result = await run(
        'frame',
        'add',
        'webapp/home/pricing-390',
        '--device',
        'phone',
      )

      expect(result.exitCode).toBe(0)
      expect(result.json().data).toMatchObject({
        box: { width: 390 },
        device: 'phone',
      })
    })

    it.each([
      ['says the size came from the name', [], true],
      [
        'says nothing of the name when a flag sized it',
        ['--width', '390'],
        false,
      ],
    ])('%s', async (_label, args, said) => {
      on('basic')

      const result = await cli(
        ['frame', 'add', 'webapp/home/pricing-390', ...args],
        { cwd: board.root },
      )

      expect(result.stdout.includes('from its name')).toBe(said)
    })
  })

  describe('transition', () => {
    it('answers the frame with the override it set', async () => {
      const run = on('basic')

      const result = await run(
        'frame',
        'transition',
        'webapp/home/about',
        'push',
        '--direction',
        'down',
      )

      expect(result.exitCode).toBe(0)
      expect(result.json().data).toHaveProperty('transition', {
        name: 'push',
        direction: 'down',
      })
    })

    it('answers the frame with no override after page', async () => {
      const run = on('basic')
      await run('frame', 'transition', 'webapp/home/about', 'zoom')

      const result = await run(
        'frame',
        'transition',
        'webapp/home/about',
        'page',
      )

      expect(result.json().data).not.toHaveProperty('transition')
    })

    it("sets a transition of the project's own by its name", async () => {
      const run = on('basic')
      mkdirSync(join(board.root, 'webapp/assets/transitions'), {
        recursive: true,
      })
      writeFileSync(
        join(board.root, 'webapp/assets/transitions/wipe.css'),
        '@keyframes enter { from { opacity: 0 } }',
      )

      const result = await run(
        'frame',
        'transition',
        'webapp/home/about',
        'wipe',
      )

      expect(result.exitCode).toBe(0)
      expect(result.json().data).toHaveProperty('transition', { name: 'wipe' })
    })

    it('refuses an unknown transition with usage, exit 2', async () => {
      const run = on('basic')

      const result = await run(
        'frame',
        'transition',
        'webapp/home/about',
        'cube',
      )

      expect(result.exitCode).toBe(2)
      expect(result.json().error?.code).toBe('usage')
    })
  })

  describe('kit', () => {
    function withKit(name: string): void {
      mkdirSync(join(board.root, `webapp/assets/kits/${name}`), {
        recursive: true,
      })
    }

    it('answers the frame with the kit it set, leaving the frame file alone', async () => {
      const run = on('basic')
      withKit('sketch')
      const bytes = readFileSync(join(board.root, 'webapp/home/about.html'))

      const result = await run('frame', 'kit', 'webapp/home/about', 'sketch')

      expect(result.exitCode).toBe(0)
      expect(result.json().data).toMatchObject({
        ref: 'webapp/home/about',
        kit: 'sketch',
      })
      expect(readFileSync(join(board.root, 'webapp/home/about.html'))).toEqual(
        bytes,
      )
    })

    it('answers the frame with no kit after none', async () => {
      const run = on('basic')
      withKit('sketch')
      await run('frame', 'kit', 'webapp/home/about', 'sketch')

      const result = await run('frame', 'kit', 'webapp/home/about', 'none')

      expect(result.exitCode).toBe(0)
      expect(result.json().data).not.toHaveProperty('kit')
    })

    it('refuses a kit the project lacks with kit-not-found, exit 3, naming the kits it holds', async () => {
      const run = on('basic')
      withKit('sketch')

      const result = await run('frame', 'kit', 'webapp/home/about', 'clean')

      expect(result.exitCode).toBe(3)
      expect(result.json().error).toMatchObject({
        code: 'kit-not-found',
        details: { known: ['sketch'] },
      })
    })
  })

  describe('speaker-notes', () => {
    it('sets a note with its line breaks and answers the frame holding it', async () => {
      const run = on('basic')

      const result = await run(
        'frame',
        'speaker-notes',
        'webapp/home/about',
        'Open on the price.\nThen the demo.',
      )

      expect(result.exitCode).toBe(0)
      expect(result.json().data).toHaveProperty(
        'speakerNotes',
        'Open on the price.\nThen the demo.',
      )
    })

    it('prints the note it holds with no text given', async () => {
      const run = on('basic')
      await run('frame', 'speaker-notes', 'webapp/home/about', 'Open on it.')

      const result = await run('frame', 'speaker-notes', 'webapp/home/about')

      expect(result.json().data).toHaveProperty('speakerNotes', 'Open on it.')
    })

    it('removes the note with --clear', async () => {
      const run = on('basic')
      await run('frame', 'speaker-notes', 'webapp/home/about', 'Open on it.')

      const result = await run(
        'frame',
        'speaker-notes',
        'webapp/home/about',
        '--clear',
      )

      expect(result.json().data).not.toHaveProperty('speakerNotes')
    })

    it('refuses text beside --clear with usage, exit 2', async () => {
      const run = on('basic')

      const result = await run(
        'frame',
        'speaker-notes',
        'webapp/home/about',
        'Open on it.',
        '--clear',
      )

      expect(result.exitCode).toBe(2)
      expect(result.json().error?.code).toBe('usage')
    })

    it('carries the note on the frame list --json answers', async () => {
      const run = on('basic')
      await run('frame', 'speaker-notes', 'webapp/home/about', 'Open on it.')

      const result = await run('list')

      const frames = listResultSchema
        .parse(result.json().data)
        .projects.flatMap((project) =>
          project.pages.flatMap((page) => page.frames),
        )
      expect(frames).toContainEqual(
        expect.objectContaining({
          ref: 'webapp/home/about',
          speakerNotes: 'Open on it.',
        }),
      )
    })
  })

  describe('device', () => {
    it('answers on with the device the width names', async () => {
      const run = on('basic')

      const result = await run('frame', 'device', 'webapp/home/about', 'on')

      expect(result.exitCode).toBe(0)
      expect(result.json().data).toMatchObject({
        ref: 'webapp/home/about',
        showDevice: true,
        device: 'phone',
      })
    })

    it('answers a desktop frame shown with a laptop', async () => {
      const run = on('basic')

      const result = await run('frame', 'device', 'webapp/home/hero', 'on')

      expect(result.json().data).toMatchObject({ device: 'laptop' })
    })

    it.each(['phone', 'tablet'])(
      'takes %s as on, the width still picking the body',
      async (name) => {
        const run = on('basic')

        const result = await run('frame', 'device', 'webapp/home/hero', name)

        expect(result.exitCode).toBe(0)
        expect(result.json().data).toMatchObject({
          showDevice: true,
          device: 'laptop',
        })
      },
    )

    it.each(['off', 'none'])(
      'answers the frame with no device after %s',
      async (name) => {
        const run = on('basic')
        await run('frame', 'device', 'webapp/home/about', 'on')

        const result = await run('frame', 'device', 'webapp/home/about', name)

        expect(result.exitCode).toBe(0)
        expect(result.json().data).not.toHaveProperty('showDevice')
        expect(result.json().data).not.toHaveProperty('device')
      },
    )

    it('names a foldable and folds it, writing the layout entry alone', async () => {
      const run = on('basic')
      const frame = join(board.root, 'webapp/home/hero.html')
      const bytes = readFileSync(frame, 'utf8')

      const result = await run(
        'frame',
        'device',
        'webapp/home/hero',
        '--foldable',
        '--pose',
        'open',
      )

      expect(result.exitCode).toBe(0)
      expect(result.json().data).toMatchObject({
        showDevice: true,
        device: 'foldable',
        pose: 'open',
        box: { width: 890, height: 626 },
      })
      expect(readFileSync(frame, 'utf8')).toBe(bytes)
    })

    it('pushes the frame to its right along by the growth when --pose opens it', async () => {
      const run = on('basic')
      await run(
        'frame',
        'device',
        'webapp/home/hero',
        '--foldable',
        '--pose',
        'closed',
      )
      const layout = () =>
        JSON.parse(
          readFileSync(join(board.root, 'webapp/home/layout.json'), 'utf8'),
        )
      const before = layout().frames.about

      const result = await run(
        'frame',
        'device',
        'webapp/home/hero',
        '--pose',
        'open',
      )

      expect(result.exitCode).toBe(0)
      expect(layout().frames.about).toMatchObject({
        x: before.x + 890 - 466,
        y: before.y,
        width: before.width,
      })
    })

    it('folds a named foldable with --pose alone', async () => {
      const run = on('basic')
      await run('frame', 'device', 'webapp/home/hero', '--foldable')

      const result = await run(
        'frame',
        'device',
        'webapp/home/hero',
        '--pose',
        'closed',
      )

      expect(result.json().data).toMatchObject({
        device: 'foldable',
        pose: 'closed',
        box: { width: 466, height: 678 },
      })
    })

    it('hands the pick back to the width with --no-foldable', async () => {
      const run = on('basic')
      await run('frame', 'device', 'webapp/home/hero', '--foldable')

      const result = await run(
        'frame',
        'device',
        'webapp/home/hero',
        '--no-foldable',
      )

      expect(result.json().data).toMatchObject({ device: 'tablet' })
      expect(result.json().data).not.toHaveProperty('pose')
    })

    it('writes the wide island with --island wide and clears it with --island compact', async () => {
      const run = on('basic')
      const layout = () =>
        JSON.parse(
          readFileSync(join(board.root, 'webapp/home/layout.json'), 'utf8'),
        ).frames.about
      await run('frame', 'device', 'webapp/home/about', 'on')

      const wide = await run(
        'frame',
        'device',
        'webapp/home/about',
        '--island',
        'wide',
      )
      const written = layout()
      const compact = await run(
        'frame',
        'device',
        'webapp/home/about',
        '--island',
        'compact',
      )

      expect(wide.exitCode).toBe(0)
      expect(wide.json().data).toMatchObject({
        device: 'phone',
        island: 'wide',
      })
      expect(written).toMatchObject({ island: 'wide' })
      expect(compact.json().data).not.toHaveProperty('island')
      expect(layout()).not.toHaveProperty('island')
    })

    it('turns a phone left with --turn and back with --turn upright, writing the layout entry alone', async () => {
      const run = on('basic')
      const frame = join(board.root, 'webapp/home/about.html')
      const bytes = readFileSync(frame, 'utf8')
      const layout = () =>
        JSON.parse(
          readFileSync(join(board.root, 'webapp/home/layout.json'), 'utf8'),
        ).frames.about
      await run('frame', 'device', 'webapp/home/about', 'on')

      const left = await run(
        'frame',
        'device',
        'webapp/home/about',
        '--turn',
        'left',
      )
      const written = layout()
      const upright = await run(
        'frame',
        'device',
        'webapp/home/about',
        '--turn',
        'upright',
      )

      expect(left.exitCode).toBe(0)
      expect(left.json().data).toMatchObject({
        device: 'phone',
        turn: 'left',
        box: { width: 844, height: 390 },
      })
      expect(written).toMatchObject({
        turn: 'left',
        upright: { width: 390, height: 844 },
      })
      expect(upright.json().data).toMatchObject({
        box: { width: 390, height: 844 },
      })
      expect(upright.json().data).not.toHaveProperty('turn')
      expect(layout()).not.toHaveProperty('turn')
      expect(layout()).not.toHaveProperty('upright')
      expect(readFileSync(frame, 'utf8')).toBe(bytes)
    })

    it.each([
      ['a turn on a laptop', ['on', '--turn', 'left']],
      ['a turn no device has', ['--turn', 'sideways']],
      ['a pose on a frame naming no foldable', ['--pose', 'open']],
      ['a pose no device has', ['--foldable', '--pose', 'tent']],
      ['an island on a frame drawing no phone', ['--island', 'wide']],
      ['an island no phone has', ['--island', 'huge']],
      ['neither a value nor a flag', []],
    ])(
      'refuses %s with usage, exit 2, writing nothing',
      async (_label, flags) => {
        const run = on('basic')
        const layout = join(board.root, 'webapp/home/layout.json')
        const bytes = readFileSync(layout, 'utf8')

        const result = await run(
          'frame',
          'device',
          'webapp/home/hero',
          ...flags,
        )

        expect(result.exitCode).toBe(2)
        expect(result.json().error?.code).toBe('usage')
        expect(readFileSync(layout, 'utf8')).toBe(bytes)
      },
    )

    it('refuses an unknown value with usage, exit 2, writing nothing', async () => {
      const run = on('basic')
      const layout = join(board.root, 'webapp/home/layout.json')
      const bytes = readFileSync(layout, 'utf8')

      const result = await run('frame', 'device', 'webapp/home/about', 'watch')

      expect(result.exitCode).toBe(2)
      expect(result.json().error?.code).toBe('usage')
      expect(readFileSync(layout, 'utf8')).toBe(bytes)
    })

    it.each(['on', 'phone'])(
      'add --device %s places the frame in the device its width names',
      async (value) => {
        const run = on('basic')

        const result = await run(
          'frame',
          'add',
          'webapp/home/pricing',
          '--size',
          'tablet',
          '--device',
          value,
        )

        expect(result.json().data).toMatchObject({
          showDevice: true,
          device: 'tablet',
        })
      },
    )
  })

  it('fails usage, exit 2, on an unknown size preset', async () => {
    const run = on('basic')

    const result = await run('frame', 'add', 'webapp/home/x', '--size', 'watch')

    expect(result.exitCode).toBe(2)
  })

  it('fails layout-invalid, exit 5, and leaves the layout bytes', async () => {
    const run = on('broken')

    const result = await run('frame', 'hide', 'home/hero')

    expect(result.exitCode).toBe(5)
    expect(result.json().error?.code).toBe('layout-invalid')
    expect(
      readFileSync(join(board.root, 'wrecked/home/layout.json'), 'utf8'),
    ).toBe('{\n')
  })

  it('fails lock-timeout, exit 6, while a live writer holds the layout', async () => {
    const run = on('basic')
    writeFileSync(
      join(board.root, 'webapp/home/layout.json.lock'),
      JSON.stringify({ pid: process.pid }),
    )

    const result = await run('frame', 'hide', 'webapp/home/hero')

    expect(result.exitCode).toBe(6)
    expect(result.json().error?.code).toBe('lock-timeout')
  })
})
