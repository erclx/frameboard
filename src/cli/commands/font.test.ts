import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { cli } from '../../../test/support/cli'
import {
  fontsource,
  rawFamily,
  staticFamily,
} from '../../../test/support/fontsource'
import { installedFontFiles } from '../../../test/support/installed-font'
import { type TempBoard, writeBoard } from '../../../test/support/temp-board'

const PLAYFAIR = rawFamily({
  id: 'playfair-display',
  family: 'Playfair Display',
  subsets: ['latin'],
})

describe('font', () => {
  let board: TempBoard
  let fonts: string

  beforeEach(() => {
    board = writeBoard({
      'acme/project.json': '{ "version": 1 }\n',
      'acme/home/hero.html': '<h1 style="font-family: Lora">Hello</h1>\n',
    })
    fonts = join(board.root, 'acme/assets/fonts')
  })

  afterEach(() => {
    board.cleanup()
  })

  function run(send: typeof fetch, ...argv: string[]) {
    return cli(['font', ...argv, '--json'], { cwd: board.root, fetch: send })
  }

  function offline(...argv: string[]) {
    return run(() => Promise.reject(new Error('offline')), ...argv)
  }

  describe('find', () => {
    it('lists ranked results with their license and writes no file', async () => {
      const { send } = fontsource([staticFamily(), PLAYFAIR, rawFamily()])

      const result = await run(send, 'find', 'serif')

      expect(result.exitCode).toBe(0)
      expect(result.json().data).toMatchObject({
        version: 1,
        query: 'serif',
        category: null,
        licenses: ['OFL-1.1', 'Apache-2.0', 'UFL-1.0'],
        source: { name: 'Fontsource', url: 'https://fontsource.org' },
        total: 2,
        results: [
          { number: 1, id: 'lora', license: 'OFL-1.1' },
          { number: 2, id: 'playfair-display', license: 'OFL-1.1' },
        ],
      })
      expect(existsSync(fonts)).toBe(false)
    })

    it('lists a category with no query', async () => {
      const { send } = fontsource([staticFamily(), rawFamily()])

      const result = await run(send, 'find', '--category', 'sans-serif')

      expect(result.json().data).toMatchObject({
        query: null,
        category: 'sans-serif',
        results: [{ id: 'lato' }],
      })
    })

    it('names Fontsource and the count past the listing for a person', async () => {
      const many = Array.from({ length: 25 }, (_, index) =>
        staticFamily({ id: `noto-${index}`, family: `Noto ${index}` }),
      )

      const result = await cli(['font', 'find', 'noto'], {
        cwd: board.root,
        fetch: fontsource(many).send,
      })

      expect(result.stdout).toContain('20 of 25')
      expect(result.stdout).toContain('Fontsource')
    })

    it.each([
      ['the numbered result', ['play', '--save', '1'], 'play'],
      ['an id with no search', ['--save', 'playfair-display'], null],
    ])(
      'installs %s as one folder with its license',
      async (_case, argv, query) => {
        const { send, asked } = fontsource([PLAYFAIR])

        const result = await run(send, 'find', ...argv)

        expect(result.exitCode).toBe(0)
        expect(result.json().data).toMatchObject({
          project: 'acme',
          path: 'fonts/playfair-display',
          licensePath: 'fonts/playfair-display/font.license.json',
          license: {
            source: 'fontsource',
            query,
            family: 'Playfair Display',
            license: 'OFL-1.1',
          },
        })
        expect(readdirSync(join(fonts, 'playfair-display')).sort()).toEqual([
          'LICENSE.txt',
          'font.license.json',
          'playfair-display-latin-wght-italic.woff2',
          'playfair-display-latin-wght-normal.woff2',
        ])
        expect(
          readFileSync(join(fonts, 'playfair-display/LICENSE.txt'), 'utf8'),
        ).toContain('The Playfair Display Project Authors')
        expect(asked.some((each) => each.url.pathname === '/v1/fonts')).toBe(
          query !== null,
        )
      },
    )

    it('keeps the weights --weights names of a static family', async () => {
      const { send } = fontsource([
        staticFamily({ subsets: ['latin'], styles: ['normal'] }),
      ])

      await run(send, 'find', '--save', 'lato', '--weights', '300,900')

      expect(
        readdirSync(join(fonts, 'lato')).filter((name) =>
          name.endsWith('.woff2'),
        ),
      ).toEqual(['lato-latin-300-normal.woff2', 'lato-latin-900-normal.woff2'])
    })

    it('refuses license-refused for another license, writing nothing', async () => {
      const { send } = fontsource([
        staticFamily({ id: 'aileron', license: 'CC0-1.0' }),
      ])

      const result = await run(send, 'find', '--save', 'aileron')

      expect(result.exitCode).toBe(15)
      expect(result.json().error).toMatchObject({ code: 'license-refused' })
      expect(existsSync(fonts)).toBe(false)
    })

    it('refuses name-taken for an installed family and downloads no file of it', async () => {
      const { send, asked } = fontsource([PLAYFAIR])
      await run(send, 'find', '--save', 'playfair-display')
      asked.length = 0

      const result = await run(send, 'find', '--save', 'playfair-display')

      expect(result.exitCode).toBe(4)
      expect(result.json().error).toMatchObject({ code: 'name-taken' })
      expect(asked.some((each) => each.url.pathname.includes('/files/'))).toBe(
        false,
      )
    })

    it('leaves nothing in assets/ when the source fails partway', async () => {
      const { send } = fontsource([rawFamily()], {
        failing: 'math-wght-italic',
      })

      const result = await run(send, 'find', '--save', 'lora')

      expect(result.exitCode).toBe(13)
      expect(result.json().error).toMatchObject({
        code: 'source-failed',
        details: { source: 'fontsource' },
      })
      expect(existsSync(join(board.root, 'acme/assets'))).toBe(false)
    })

    it('refuses source-failed naming Fontsource when it does not answer', async () => {
      const result = await offline('find', 'lora')

      expect(result.json().error).toMatchObject({
        code: 'source-failed',
        message: expect.stringContaining('Fontsource'),
      })
    })

    it('refuses result-not-found for a number past the results', async () => {
      const { send } = fontsource([rawFamily()])

      const result = await run(send, 'find', 'lora', '--save', '9')

      expect(result.json().error).toMatchObject({
        code: 'result-not-found',
        details: { number: 9, results: 1 },
      })
    })

    it.each([
      ['no query and no category', []],
      ['--weights with no --save', ['lora', '--weights', '400']],
      [
        'a --weights that is no list of weights',
        ['--save', 'lato', '--weights', 'bold'],
      ],
      ['a category Fontsource lacks', ['--category', 'blackletter']],
      ['a number to save with no search', ['--save', '1']],
    ])(
      'refuses usage for %s, asking the source nothing',
      async (_case, argv) => {
        const { send, asked } = fontsource([staticFamily(), rawFamily()])

        const result = await run(send, 'find', ...argv)

        expect(result.exitCode).toBe(2)
        expect(asked).toEqual([])
      },
    )
  })

  describe('list', () => {
    it('answers the installed fonts and the frames drawing in each', async () => {
      const installed = writeBoard({
        'acme/project.json': '{ "version": 1 }\n',
        'acme/home/hero.html': '<h1 style="font-family: Lora">Hello</h1>\n',
        ...installedFontFiles('acme', 'lora', 'Lora'),
      })

      const result = await cli(['font', 'list', '--json'], {
        cwd: installed.root,
      })
      installed.cleanup()

      expect(result.json().data).toMatchObject({
        version: 1,
        project: 'acme',
        fonts: [
          {
            id: 'lora',
            family: 'Lora',
            license: 'OFL-1.1',
            frames: ['acme/home/hero'],
          },
        ],
      })
    })

    it('answers none for a project that installed none', async () => {
      const result = await offline('list')

      expect(result.exitCode).toBe(0)
      expect(result.json().data).toMatchObject({ project: 'acme', fonts: [] })
    })
  })

  describe('remove', () => {
    it('takes the family out and names the frames still drawing in it', async () => {
      const { send } = fontsource([rawFamily({ subsets: ['latin'] })])
      await run(send, 'find', '--save', 'lora')

      const result = await offline('remove', 'lora')

      expect(result.json().data).toEqual({
        version: 1,
        project: 'acme',
        id: 'lora',
        family: 'Lora',
        frames: ['acme/home/hero'],
      })
      expect(existsSync(join(fonts, 'lora'))).toBe(false)
    })

    it('refuses font-not-found for a family the project lacks', async () => {
      const result = await offline('remove', 'inter')

      expect(result.exitCode).toBe(3)
      expect(result.json().error).toMatchObject({ code: 'font-not-found' })
    })
  })
})
