import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { LicenseFile } from '@/shared/records/sourcing'

import { installedLicense } from '../../../test/support/installed-font'
import { recordingJournal } from '../../../test/support/recording-journal'
import { type TempBoard, writeBoard } from '../../../test/support/temp-board'
import {
  DOWNLOAD_LIMIT,
  downloadImage,
  imageExtension,
  savedStem,
  saveFont,
  saveImage,
  saveModel,
} from './save'

function foundLicense(): LicenseFile {
  return {
    version: 1,
    origin: 'found',
    source: 'openverse',
    id: 'abc',
    query: 'modern house',
    title: 'A house',
    creator: 'Ann',
    creatorUrl: null,
    license: 'cc0',
    licenseVersion: '1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    attribution: 'A house by Ann is marked with CC0 1.0.',
    landingUrl: null,
    url: 'https://images.example.org/abc.jpg',
    savedAt: '2026-11-18T12:00:00.000Z',
  }
}

function modelLicense(): LicenseFile {
  return {
    version: 1,
    origin: 'found',
    source: 'polyhaven',
    id: 'wooden_stool_01',
    query: 'stool',
    title: 'Wooden Stool 01',
    authors: ['Kuutti Siitonen'],
    license: 'cc0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    landingUrl: 'https://polyhaven.com/a/wooden_stool_01',
    url: 'https://dl.polyhaven.org/file/ph-assets/Models/gltf/1k/wooden_stool_01/wooden_stool_01_1k.gltf',
    size: '1k',
    savedAt: '2026-11-19T12:00:00.000Z',
  }
}

function answering(response: () => Response): typeof fetch {
  return (async () => response()) as typeof fetch
}

describe('save', () => {
  let board: TempBoard
  let project: { name: string; path: string }
  let assets: string

  beforeEach(() => {
    board = writeBoard({ 'acme/project.json': '{ "version": 1 }\n' })
    project = { name: 'acme', path: join(board.root, 'acme') }
    assets = join(project.path, 'assets')
  })

  afterEach(() => {
    board.cleanup()
  })

  describe('saveImage', () => {
    it('writes the image and its license file under the same name', async () => {
      const image = { bytes: new Uint8Array([1, 2, 3]), extension: 'jpg' }

      const saved = await saveImage(
        project,
        'modern-house',
        image,
        foundLicense(),
      )

      expect(saved).toMatchObject({
        project: 'acme',
        path: 'modern-house.jpg',
        licensePath: 'modern-house.jpg.license.json',
      })
      expect([...readFileSync(join(assets, 'modern-house.jpg'))]).toEqual([
        1, 2, 3,
      ])
      expect(
        JSON.parse(
          readFileSync(join(assets, 'modern-house.jpg.license.json'), 'utf8'),
        ),
      ).toEqual(foundLicense())
    })

    it('lands on the next free name, its license file taking that name', async () => {
      const image = { bytes: new Uint8Array([9]), extension: 'jpg' }
      await saveImage(project, 'house', image, foundLicense())

      const saved = await saveImage(project, 'house', image, foundLicense())

      expect(saved.path).toBe('house-2.jpg')
      expect(readdirSync(assets).sort()).toEqual([
        'house-2.jpg',
        'house-2.jpg.license.json',
        'house.jpg',
        'house.jpg.license.json',
      ])
    })

    it('takes the image back out when its license file cannot land', async () => {
      // A folder holding the license file's name makes the rename fail.
      mkdirSync(join(assets, 'house.jpg.license.json', 'blocked'), {
        recursive: true,
      })
      const image = { bytes: new Uint8Array([9]), extension: 'jpg' }

      await expect(
        saveImage(project, 'house', image, foundLicense()),
      ).rejects.toThrow()

      expect(readdirSync(assets)).toEqual(['house.jpg.license.json'])
    })
  })

  describe('saveModel', () => {
    it('writes one .glb and its license file under the same name', async () => {
      const saved = await saveModel(
        project,
        'stool',
        new Uint8Array([4, 5, 6]),
        modelLicense(),
      )

      expect(saved).toMatchObject({
        path: 'stool.glb',
        licensePath: 'stool.glb.license.json',
      })
      expect(readdirSync(assets).sort()).toEqual([
        'stool.glb',
        'stool.glb.license.json',
      ])
      expect(
        JSON.parse(
          readFileSync(join(assets, 'stool.glb.license.json'), 'utf8'),
        ),
      ).toEqual(modelLicense())
    })

    it('lands on the next free name, its license file taking that name', async () => {
      await saveModel(project, 'stool', new Uint8Array([1]), modelLicense())

      const saved = await saveModel(
        project,
        'stool',
        new Uint8Array([1]),
        modelLicense(),
      )

      expect(saved.licensePath).toBe('stool-2.glb.license.json')
    })
  })

  describe('saveFont', () => {
    const font = {
      files: new Map([
        ['lora-latin-wght-normal.woff2', new Uint8Array([1, 2, 3])],
      ]),
      licenseText: new TextEncoder().encode('Copyright 2011 The Lora Authors'),
    }

    function folder(): string[] {
      const fonts = join(assets, 'fonts')
      return existsSync(fonts) ? readdirSync(fonts) : []
    }

    it('makes assets/ and lands the files, the license text, and the record in one folder', async () => {
      const saved = await saveFont(
        project,
        font,
        installedLicense('lora', 'Lora'),
      )

      expect(saved).toEqual({
        version: 1,
        project: 'acme',
        path: 'fonts/lora',
        licensePath: 'fonts/lora/font.license.json',
        license: installedLicense('lora', 'Lora'),
      })
      const lora = join(assets, 'fonts/lora')
      expect(readdirSync(lora).sort()).toEqual([
        'LICENSE.txt',
        'font.license.json',
        'lora-latin-wght-normal.woff2',
      ])
      expect([
        ...readFileSync(join(lora, 'lora-latin-wght-normal.woff2')),
      ]).toEqual([1, 2, 3])
      expect(readFileSync(join(lora, 'LICENSE.txt'), 'utf8')).toBe(
        'Copyright 2011 The Lora Authors',
      )
      expect(
        JSON.parse(readFileSync(join(lora, 'font.license.json'), 'utf8')),
      ).toEqual(installedLicense('lora', 'Lora'))
    })

    it.each([
      ['the family is installed', 'lora'],
      ['a folder holds its name in another case', 'Lora'],
    ])(
      'refuses name-taken and keeps what is there when %s',
      async (_case, name) => {
        mkdirSync(join(assets, 'fonts', name), { recursive: true })

        const saving = saveFont(project, font, installedLicense('lora', 'Lora'))

        await expect(saving).rejects.toMatchObject({
          code: 'name-taken',
          details: { id: name },
        })
        expect(folder()).toEqual([name])
        expect(readdirSync(join(assets, 'fonts', name))).toEqual([])
      },
    )

    it('leaves one whole family when two installs of it race', async () => {
      const license = installedLicense('lora', 'Lora')

      const landed = await Promise.allSettled([
        saveFont(project, font, license),
        saveFont(project, font, license),
      ])

      expect(landed.map((each) => each.status).sort()).toEqual([
        'fulfilled',
        'rejected',
      ])
      expect(folder()).toEqual(['lora'])
      expect(readdirSync(join(assets, 'fonts/lora'))).toHaveLength(3)
    })

    it('leaves nothing in assets/ when a file cannot be written', async () => {
      const files = new Map([
        ...font.files,
        ['missing/lora.woff2', new Uint8Array([4])] as const,
      ])

      const saving = saveFont(
        project,
        { ...font, files },
        installedLicense('lora', 'Lora'),
      )

      await expect(saving).rejects.toMatchObject({ code: 'ENOENT' })
      expect(existsSync(join(assets, 'fonts'))).toBe(false)
    })

    it('records the folder it made in a journal', async () => {
      const { journal, calls } = recordingJournal(board.root)

      await saveFont(project, font, installedLicense('lora', 'Lora'), {
        journal,
      })

      expect(calls).toEqual([
        { kind: 'created', path: 'acme/assets/fonts/lora' },
      ])
    })
  })

  describe('downloadImage', () => {
    it('takes the extension the media type names', async () => {
      const send = answering(
        () =>
          new Response(new Uint8Array([1]), {
            headers: { 'content-type': 'image/png' },
          }),
      )

      const image = await downloadImage('https://x.example/photo', send)

      expect(image.extension).toBe('png')
    })

    it('refuses source-failed for a download that is not an image', async () => {
      const send = answering(
        () =>
          new Response('<html>', { headers: { 'content-type': 'text/html' } }),
      )

      await expect(
        downloadImage('https://x.example/page', send),
      ).rejects.toMatchObject({ code: 'source-failed' })
    })

    it('refuses source-failed for a body declared past the limit', async () => {
      const send = answering(
        () =>
          new Response(new Uint8Array([1]), {
            headers: {
              'content-type': 'image/jpeg',
              'content-length': String(DOWNLOAD_LIMIT + 1),
            },
          }),
      )

      await expect(
        downloadImage('https://x.example/a.jpg', send),
      ).rejects.toMatchObject({ code: 'source-failed' })
    })

    it('stops reading a body with no declared length once it passes the limit', async () => {
      let pulled = 0
      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          pulled += 1
          controller.enqueue(new Uint8Array([1, 2, 3]))
        },
      })
      const send = answering(
        () => new Response(body, { headers: { 'content-type': 'image/jpeg' } }),
      )

      await expect(
        downloadImage('https://x.example/a.jpg', send, 8),
      ).rejects.toMatchObject({ code: 'source-failed', details: { limit: 8 } })
      expect(pulled).toBeLessThan(10)
    })

    it('takes a body with no declared length up to the limit whole', async () => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2]))
          controller.enqueue(new Uint8Array([3, 4]))
          controller.close()
        },
      })
      const send = answering(
        () => new Response(body, { headers: { 'content-type': 'image/png' } }),
      )

      const image = await downloadImage('https://x.example/a.png', send, 4)

      expect([...image.bytes]).toEqual([1, 2, 3, 4])
    })

    it('refuses source-failed and writes nothing when the body breaks off', async () => {
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2]))
          controller.error(new Error('connection reset'))
        },
      })
      const send = answering(
        () => new Response(body, { headers: { 'content-type': 'image/jpeg' } }),
      )

      await expect(
        downloadImage('https://x.example/a.jpg', send),
      ).rejects.toMatchObject({ code: 'source-failed' })
      expect(existsSync(assets)).toBe(false)
    })

    it('refuses source-failed with the status the host answered', async () => {
      const send = answering(() => new Response('gone', { status: 410 }))

      await expect(
        downloadImage('https://x.example/a.jpg', send),
      ).rejects.toMatchObject({
        code: 'source-failed',
        details: { status: 410 },
      })
    })
  })

  describe('imageExtension', () => {
    it.each([
      ['image/jpeg; charset=binary', null, 'jpg'],
      ['image/svg+xml', null, 'svg'],
      ['application/octet-stream', 'https://x.example/a/photo.JPEG', 'jpeg'],
      ['application/octet-stream', 'https://x.example/a/clip.mp4', null],
      [null, 'https://x.example/a/photo', null],
    ])('reads %s at %s as %s', (type, url, expected) => {
      expect(imageExtension(type, url)).toBe(expected)
    })
  })

  describe('savedStem', () => {
    it('slugs the query when no name is given', () => {
      expect(savedStem(undefined, 'Modern House, at dusk')).toBe(
        'modern-house-at-dusk',
      )
    })

    it('falls back to image for a query holding no name characters', () => {
      expect(savedStem(undefined, '!!!')).toBe('image')
    })

    it('falls back to the given word for a model', () => {
      expect(savedStem(undefined, '!!!', 'model')).toBe('model')
    })

    it('refuses invalid-name for a name breaking the board rule', () => {
      expect(() => savedStem('../escape', 'house')).toThrow(
        expect.objectContaining({ code: 'invalid-name' }),
      )
    })
  })
})
