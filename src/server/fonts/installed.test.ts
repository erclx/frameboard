import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  installedFontFiles,
  installedLicense,
} from '../../../test/support/installed-font'
import { type TempBoard, writeBoard } from '../../../test/support/temp-board'
import { fontSheet, listFonts, projectFonts } from './installed'

const TEXT = (style: string) => `<p style="${style}">Hello</p>\n`

describe('installed fonts', () => {
  let board: TempBoard
  let project: string

  beforeEach(() => {
    board = writeBoard({
      'acme/project.json': '{ "version": 1 }\n',
      ...installedFontFiles('acme', 'lora', 'Lora'),
      ...installedFontFiles('acme', 'playfair-display', 'Playfair Display'),
      // Files a project added by hand, which no record makes an installed font.
      'acme/assets/fonts/brand/Brand.woff2': 'brand',
      'acme/assets/fonts/Loose.woff2': 'loose',
    })
    project = join(board.root, 'acme')
  })

  afterEach(() => {
    board.cleanup()
  })

  describe('projectFonts', () => {
    it('answers the folders holding a record, by family', async () => {
      const fonts = await projectFonts(project)

      expect(fonts.map((each) => [each.id, each.record.family])).toEqual([
        ['lora', 'Lora'],
        ['playfair-display', 'Playfair Display'],
      ])
    })

    it('answers none for a project with no assets', async () => {
      expect(await projectFonts(join(board.root, 'empty'))).toEqual([])
    })

    it.each([
      ['that does not parse', '{'],
      ['of another source', '{ "source": "openverse" }'],
      [
        'naming a file outside its folder',
        JSON.stringify(installedLicense('evil', 'Evil', '../../x.woff2')),
      ],
      [
        'whose family would close its CSS string',
        JSON.stringify(installedLicense('evil', 'Evil"}body{color:red')),
      ],
    ])('leaves out a record %s', async (_case, record) => {
      const other = writeBoard({
        'acme/assets/fonts/evil/font.license.json': record,
      })

      const fonts = await projectFonts(join(other.root, 'acme'))
      other.cleanup()

      expect(fonts).toEqual([])
    })
  })

  describe('fontSheet', () => {
    it("declares each file under the family's own name, at an address beside the sheet", async () => {
      const sheet = fontSheet(await projectFonts(project))

      expect(sheet).toContain(
        '@font-face{font-family:"Playfair Display";font-style:normal;font-weight:400 700;font-display:swap;src:url("assets/fonts/playfair-display/playfair-display-latin-wght-normal.woff2") format("woff2");unicode-range:U+0000-00FF}',
      )
    })

    it('declares a single weight once and no range for a file covering everything', () => {
      const record = installedLicense('mono', 'Mono')
      const sheet = fontSheet([
        {
          id: 'mono',
          record: {
            ...record,
            faces: [
              {
                file: 'mono.woff2',
                style: 'italic',
                weights: { min: 400, max: 400 },
                unicodeRange: null,
              },
            ],
          },
        },
      ])

      expect(sheet).toBe(
        '@font-face{font-family:"Mono";font-style:italic;font-weight:400;font-display:swap;src:url("assets/fonts/mono/mono.woff2") format("woff2")}',
      )
    })
  })

  describe('listFonts', () => {
    it('answers each font with its license, weights, styles, and folder', async () => {
      const { fonts } = await listFonts(board.root, 'acme')

      expect(fonts[0]).toEqual({
        id: 'lora',
        family: 'Lora',
        category: 'serif',
        license: 'OFL-1.1',
        licenseUrl:
          'https://openfontlicense.org/open-font-license-official-text/',
        landingUrl: 'https://fontsource.org/fonts/lora',
        variable: true,
        weights: [{ min: 400, max: 700 }],
        styles: ['normal'],
        path: 'fonts/lora',
        files: 1,
        frames: [],
      })
    })

    it('names the frames drawing text in each family, in any case and through a token', async () => {
      const used = writeBoard({
        'acme/project.json': '{ "version": 1 }\n',
        'acme/tokens.css': ':root { --font-title: "playfair display", serif }',
        ...installedFontFiles('acme', 'lora', 'Lora'),
        ...installedFontFiles('acme', 'playfair-display', 'Playfair Display'),
        'acme/home/body.html': TEXT("font-family: 'lora', serif"),
        'acme/home/fallback.html': TEXT('font-family: Geist, Lora'),
        'acme/home/plain.html': TEXT('font-family: Geist'),
        'acme/home/prose.html': '<p style="font-family: Geist">Lora</p>',
        'acme/pricing/title.html': TEXT('font-family: var(--font-title)'),
      })

      const { fonts } = await listFonts(used.root, 'acme')
      used.cleanup()

      expect(fonts.map((each) => [each.id, each.frames])).toEqual([
        ['lora', ['acme/home/body']],
        ['playfair-display', ['acme/pricing/title']],
      ])
    })
  })
})
