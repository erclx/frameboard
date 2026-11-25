import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { recordingJournal } from '../../../test/support/recording-journal'
import { type TempBoard, writeBoard } from '../../../test/support/temp-board'
import { installKit } from './install'
import { findKit, shippedKitsDir } from './list'

// Fails the next renames onto a held kit's folder, which no state on disk does between the two a swap makes.
const broken = vi.hoisted(() => ({ renamesOntoPlain: 0 }))

vi.mock('node:fs/promises', async (importOriginal) => {
  const fs = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...fs,
    rename: async (...args: Parameters<typeof fs.rename>) => {
      if (
        broken.renamesOntoPlain > 0 &&
        String(args[1]).endsWith('assets/kits/plain')
      ) {
        broken.renamesOntoPlain -= 1
        throw new Error('no rename')
      }
      return fs.rename(...args)
    },
  }
})

const PROJECT = {
  'acme/project.json': '{ "version": 1, "pages": ["home"] }\n',
  'acme/home/layout.json': '{ "version": 1, "frames": {} }\n',
}

const FOLDER_KIT = {
  'kits/plain/kit.json':
    '{ "version": 1, "title": "Plain", "description": "From a folder" }\n',
  'kits/plain/tokens.css': ':root { --accent: teal }\n',
  'kits/plain/kit.css': '.kit-card { border: 1px solid }\n',
  'kits/plain/kit.md': '# Plain\n',
}

function read(board: TempBoard, path: string): string {
  return readFileSync(join(board.root, path), 'utf8')
}

describe('installKit', () => {
  let board: TempBoard

  afterEach(() => {
    board.cleanup()
  })

  it("copies the kit's folder into the project's assets/kits, samples included", async () => {
    board = writeBoard(PROJECT)

    await installKit(board.root, 'acme', findKit(board.root, 'sketch'))

    const kit = join(board.root, 'acme/assets/kits/sketch')
    expect(readdirSync(kit).sort()).toEqual([
      'kit',
      'kit.css',
      'kit.json',
      'kit.md',
      'tokens.css',
    ])
    expect(readdirSync(join(kit, 'kit')).sort()).toEqual([
      'layout.json',
      'parts.html',
      'sample.html',
    ])
    expect(read(board, 'acme/assets/kits/sketch/tokens.css')).toBe(
      readFileSync(join(shippedKitsDir(), 'sketch/tokens.css'), 'utf8'),
    )
  })

  it.each([
    ['a project sheet', 'acme/tokens.css'],
    ['a board sheet', 'tokens.css'],
  ])(
    'adds a kit where %s reaches the project and leaves that sheet untouched',
    async (_case, sheet) => {
      board = writeBoard({ ...PROJECT, [sheet]: ':root { --accent: red }\n' })

      await installKit(board.root, 'acme', findKit(board.root, 'clean'))

      expect(read(board, sheet)).toBe(':root { --accent: red }\n')
      expect(existsSync(join(board.root, 'acme/assets/kits/clean'))).toBe(true)
    },
  )

  it('writes no project sheet and no page', async () => {
    board = writeBoard(PROJECT)

    await installKit(board.root, 'acme', findKit(board.root, 'clean'))

    expect(readdirSync(join(board.root, 'acme')).sort()).toEqual([
      'assets',
      'home',
      'project.json',
    ])
  })

  it('adds a second kit beside the first', async () => {
    board = writeBoard(PROJECT)
    await installKit(board.root, 'acme', findKit(board.root, 'clean'))

    await installKit(board.root, 'acme', findKit(board.root, 'sketch'))

    expect(readdirSync(join(board.root, 'acme/assets/kits')).sort()).toEqual([
      'clean',
      'sketch',
    ])
  })

  it('answers the project, the kit, and the folder it wrote', async () => {
    board = writeBoard(PROJECT)

    const record = await installKit(
      board.root,
      'acme',
      findKit(board.root, 'clean'),
    )

    expect(record).toEqual({
      project: 'acme',
      kit: 'clean',
      written: [join(board.root, 'acme/assets/kits/clean')],
    })
  })

  it('adds a kit from a folder that carries no sample page', async () => {
    board = writeBoard({ ...PROJECT, ...FOLDER_KIT })

    await installKit(board.root, 'acme', {
      name: 'plain',
      path: join(board.root, 'kits/plain'),
    })

    expect(
      readdirSync(join(board.root, 'acme/assets/kits/plain')).sort(),
    ).toEqual(['kit.css', 'kit.json', 'kit.md', 'tokens.css'])
  })

  it.each([
    ['a project with no assets folder', {}, 'acme/assets'],
    [
      'a project holding assets and no kits',
      { 'acme/assets/logo.svg': '<svg />' },
      'acme/assets/kits',
    ],
    [
      'a project holding another kit',
      { 'acme/assets/kits/brand/kit.css': '' },
      'acme/assets/kits/clean',
    ],
  ])(
    'reports the topmost folder it made to the journal for %s, so one undo takes the install back',
    async (_case, files, made) => {
      board = writeBoard({ ...PROJECT, ...files })
      const { journal, calls } = recordingJournal(board.root)

      await installKit(board.root, 'acme', findKit(board.root, 'clean'), {
        journal,
      })

      expect(calls).toEqual([{ kind: 'created', path: made }])
    },
  )

  it.each([
    ['the same name', 'clean'],
    ['a name differing only in case', 'Clean'],
  ])(
    'refuses name-taken where the project holds a kit under %s, leaving it as it was',
    async (_case, held) => {
      board = writeBoard({
        ...PROJECT,
        [`acme/assets/kits/${held}/kit.css`]: '.kit-card { border: 0 }\n',
      })

      await expect(
        installKit(board.root, 'acme', findKit(board.root, 'clean')),
      ).rejects.toMatchObject({
        code: 'name-taken',
        details: { project: 'acme', kit: held },
      })
      expect(readdirSync(join(board.root, `acme/assets/kits/${held}`))).toEqual(
        ['kit.css'],
      )
    },
  )

  it('points the refusal over a held kit at --replace, which keeps the frames naming it', async () => {
    board = writeBoard({ ...PROJECT, 'acme/assets/kits/clean/kit.css': '' })

    const refused = installKit(board.root, 'acme', findKit(board.root, 'clean'))

    await expect(refused).rejects.toThrow('--replace')
    await expect(refused).rejects.not.toThrow('kit remove')
  })

  it('refuses invalid-name for a folder whose name no frame could name, writing nothing', async () => {
    board = writeBoard({
      ...PROJECT,
      'kits/my kit/kit.json':
        '{ "version": 1, "title": "Mine", "description": "" }\n',
      'kits/my kit/tokens.css': ':root {}\n',
    })

    await expect(
      installKit(board.root, 'acme', {
        name: 'my kit',
        path: join(board.root, 'kits/my kit'),
      }),
    ).rejects.toMatchObject({ code: 'invalid-name' })
    expect(existsSync(join(board.root, 'acme/assets'))).toBe(false)
  })

  it('refuses kit-invalid for a folder with no kit.json, writing nothing', async () => {
    board = writeBoard({ ...PROJECT, 'kits/empty/tokens.css': ':root {}\n' })

    await expect(
      installKit(board.root, 'acme', {
        name: 'empty',
        path: join(board.root, 'kits/empty'),
      }),
    ).rejects.toMatchObject({ code: 'kit-invalid' })
    expect(existsSync(join(board.root, 'acme/assets'))).toBe(false)
  })

  describe('with replace', () => {
    const HELD = {
      'acme/assets/kits/plain/kit.json':
        '{ "version": 1, "title": "Plain", "description": "Old" }\n',
      'acme/assets/kits/plain/tokens.css': ':root { --accent: red }\n',
      'acme/assets/kits/plain/gone.css': '.kit-old { color: red }\n',
    }

    afterEach(() => {
      broken.renamesOntoPlain = 0
    })

    function replaceWith(path: string) {
      return installKit(
        board.root,
        'acme',
        { name: 'plain', path: join(board.root, path) },
        { replace: true },
      )
    }

    function kitsFolder(): string[] {
      return readdirSync(join(board.root, 'acme/assets/kits')).sort()
    }

    it('puts the new folder in place of the held one, dropping a file the new copy lacks', async () => {
      board = writeBoard({ ...PROJECT, ...FOLDER_KIT, ...HELD })

      const record = await replaceWith('kits/plain')

      expect(record).toEqual({
        project: 'acme',
        kit: 'plain',
        written: [join(board.root, 'acme/assets/kits/plain')],
        replaced: true,
      })
      expect(
        readdirSync(join(board.root, 'acme/assets/kits/plain')).sort(),
      ).toEqual(['kit.css', 'kit.json', 'kit.md', 'tokens.css'])
      expect(read(board, 'acme/assets/kits/plain/tokens.css')).toBe(
        ':root { --accent: teal }\n',
      )
      expect(kitsFolder()).toEqual(['plain'])
    })

    it("leaves a frame's kit as it was", async () => {
      const layout =
        '{ "version": 1, "frames": { "hero": { "x": 0, "y": 0, "width": 10, "height": 10, "order": 0, "kit": "plain" } } }\n'
      board = writeBoard({
        ...PROJECT,
        ...FOLDER_KIT,
        ...HELD,
        'acme/home/layout.json': layout,
        'acme/home/hero.html': '<p>Hero</p>\n',
      })

      await replaceWith('kits/plain')

      expect(read(board, 'acme/home/layout.json')).toBe(layout)
    })

    it('writes into a kit held under another case, so the frames naming it keep drawing', async () => {
      board = writeBoard({
        ...PROJECT,
        ...FOLDER_KIT,
        'acme/assets/kits/Plain/tokens.css': ':root { --accent: red }\n',
      })

      const record = await replaceWith('kits/plain')

      expect(record.kit).toBe('Plain')
      expect(kitsFolder()).toEqual(['Plain'])
      expect(read(board, 'acme/assets/kits/Plain/tokens.css')).toBe(
        ':root { --accent: teal }\n',
      )
    })

    it('replaces the held copy with the kit a name answers to', async () => {
      board = writeBoard({
        ...PROJECT,
        'acme/assets/kits/clean/tokens.css': ':root { --accent: red }\n',
      })

      await installKit(board.root, 'acme', findKit(board.root, 'clean'), {
        replace: true,
      })

      expect(read(board, 'acme/assets/kits/clean/tokens.css')).toBe(
        readFileSync(join(shippedKitsDir(), 'clean/tokens.css'), 'utf8'),
      )
    })

    it('adds the kit where the project holds none, answering no replaced', async () => {
      board = writeBoard({ ...PROJECT, ...FOLDER_KIT })

      const record = await replaceWith('kits/plain')

      expect(record).not.toHaveProperty('replaced')
      expect(kitsFolder()).toEqual(['plain'])
    })

    it.each([
      ['kit.json', 'tokens.css', ':root {}\n'],
      [
        'tokens.css',
        'kit.json',
        '{ "version": 1, "title": "Plain", "description": "" }\n',
      ],
    ])(
      'refuses kit-invalid for a source with no %s, leaving the held kit whole and no stage',
      async (_missing, file, text) => {
        board = writeBoard({
          ...PROJECT,
          ...HELD,
          [`kits/plain/${file}`]: text,
        })

        await expect(replaceWith('kits/plain')).rejects.toMatchObject({
          code: 'kit-invalid',
        })

        expect(
          Object.keys(HELD).map((path) => [path, read(board, path)]),
        ).toEqual(Object.entries(HELD))
        expect(kitsFolder()).toEqual(['plain'])
      },
    )

    it("leaves the kit whole where the source is the project's own copy", async () => {
      board = writeBoard({ ...PROJECT, ...HELD })

      await replaceWith('acme/assets/kits/plain')

      expect(
        Object.keys(HELD).map((path) => [path, read(board, path)]),
      ).toEqual(Object.entries(HELD))
    })

    it("copies the files a link points at, so a link to the project's own copy never ends pointing at itself", async () => {
      board = writeBoard({ ...PROJECT, ...HELD })
      mkdirSync(join(board.root, 'linked'))
      symlinkSync(
        join(board.root, 'acme/assets/kits/plain'),
        join(board.root, 'linked/plain'),
      )

      await replaceWith('linked/plain')

      expect(
        Object.keys(HELD).map((path) => [path, read(board, path)]),
      ).toEqual(Object.entries(HELD))
    })

    it('puts the held kit back where the new copy cannot be moved in', async () => {
      board = writeBoard({ ...PROJECT, ...FOLDER_KIT, ...HELD })
      broken.renamesOntoPlain = 1

      await expect(replaceWith('kits/plain')).rejects.toThrow('no rename')

      expect(
        Object.keys(HELD).map((path) => [path, read(board, path)]),
      ).toEqual(Object.entries(HELD))
      expect(kitsFolder()).toEqual(['plain'])
    })

    it('keeps the held kit on disk where it cannot be put back either', async () => {
      board = writeBoard({ ...PROJECT, ...FOLDER_KIT, ...HELD })
      broken.renamesOntoPlain = 2

      await expect(replaceWith('kits/plain')).rejects.toThrow('no rename')

      const kits = readdirSync(join(board.root, 'acme/assets/kits'), {
        recursive: true,
      })
      expect(kits).toContainEqual(expect.stringMatching(/\/gone\.css$/))
    })

    it.each([
      ['a file', (path: string) => writeFileSync(path, 'a file\n')],
      [
        'a symlink',
        (path: string) => symlinkSync(join(shippedKitsDir(), 'clean'), path),
      ],
    ])(
      "refuses name-taken where %s stands at the kit's path",
      async (_case, stand) => {
        board = writeBoard({
          ...PROJECT,
          ...FOLDER_KIT,
          'acme/assets/kits/other/kit.css': '',
        })
        stand(join(board.root, 'acme/assets/kits/plain'))

        const refused = replaceWith('kits/plain')

        await expect(refused).rejects.toMatchObject({ code: 'name-taken' })
        await expect(refused).rejects.not.toThrow('--replace')
      },
    )
  })
})
