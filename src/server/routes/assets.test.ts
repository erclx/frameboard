import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../../test/support/fixture-board'
import { type AssetUsage, createAssetUsage } from '../board/asset-usage'
import { claim } from '../claims/store'
import { History } from '../history/stack'
import { assetsRoutes } from './assets'

const TOKEN = 'a'.repeat(64)
const PORT = 4173

describe('assetsRoutes', () => {
  let board: FixtureBoard
  let history: History

  beforeEach(() => {
    board = copyFixtureBoard('basic')
    history = new History(board.root)
  })

  afterEach(() => {
    board.cleanup()
  })

  function routes(limit?: number, usage?: AssetUsage) {
    return assetsRoutes(
      board.root,
      {
        token: () => TOKEN,
        key: 'b'.repeat(64),
        cookieName: 'frameboard-key-111111111111',
        isOwnOrigin: (host) => host === `127.0.0.1:${PORT}`,
      },
      history,
      { limit, usage },
    )
  }

  function drop(
    files: [name: string, content: string][],
    {
      project = 'webapp',
      token = TOKEN as string | null,
      limit = undefined as number | undefined,
    } = {},
  ) {
    const form = new FormData()
    for (const [name, content] of files)
      form.append('files', new File([content], name))
    return routes(limit).request(`/api/projects/${project}/assets`, {
      method: 'POST',
      headers: token === null ? {} : { authorization: `Bearer ${token}` },
      body: form,
    })
  }

  describe('GET', () => {
    it('answers an empty list in the envelope for a project with no assets', async () => {
      const response = await routes().request('/api/projects/webapp/assets')

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ ok: true, data: { files: [] } })
    })

    it('carries the number of frames linking each file, zero for an unlinked one', async () => {
      mkdirSync(join(board.root, 'webapp/assets'))
      writeFileSync(join(board.root, 'webapp/assets/logo.svg'), '<svg/>')
      writeFileSync(join(board.root, 'webapp/assets/brand.woff2'), 'font')
      writeFileSync(
        join(board.root, 'webapp/home/logo.html'),
        '<img src="../assets/logo.svg">',
      )

      const response = await routes(
        undefined,
        createAssetUsage(board.root),
      ).request('/api/projects/webapp/assets')

      const { data } = await response.json()
      expect(data.files).toMatchObject([
        { path: 'brand.woff2', frames: 0 },
        { path: 'logo.svg', frames: 1 },
      ])
    })

    it('answers 404 for a project that does not exist', async () => {
      const response = await routes().request('/api/projects/nope/assets')

      expect(response.status).toBe(404)
      expect(await response.json()).toMatchObject({
        ok: false,
        error: { code: 'project-not-found' },
      })
    })
  })

  describe('POST', () => {
    it('writes the files and lists them back', async () => {
      const response = await drop([['hero.png', 'pixels']])

      expect(await response.json()).toEqual({
        ok: true,
        data: {
          added: [{ name: 'hero.png', path: 'hero.png' }],
          refused: [],
        },
      })
      expect(
        readFileSync(join(board.root, 'webapp/assets/hero.png'), 'utf8'),
      ).toBe('pixels')
      const listed = await routes().request('/api/projects/webapp/assets')
      expect(await listed.json()).toEqual({
        ok: true,
        data: { files: [{ path: 'hero.png', kind: 'image', size: 6 }] },
      })
    })

    it('reports a mixed drop as added and refused', async () => {
      const response = await drop([
        ['ok.png', 'x'],
        ['page.html', '<p>'],
      ])

      const { data } = await response.json()
      expect(data.added).toEqual([{ name: 'ok.png', path: 'ok.png' }])
      expect(data.refused).toMatchObject([
        { name: 'page.html', code: 'asset-type-refused' },
      ])
    })

    it('refuses a caller that is not a writer with 401 and writes nothing', async () => {
      const response = await drop([['hero.png', 'x']], { token: null })

      expect(response.status).toBe(401)
      expect(existsSync(join(board.root, 'webapp/assets'))).toBe(false)
    })

    it('answers 404 for a project that does not exist', async () => {
      const response = await drop([['hero.png', 'x']], { project: 'nope' })

      expect(response.status).toBe(404)
    })

    it('answers 400 for a body with no files', async () => {
      const response = await drop([])

      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({
        error: { code: 'usage' },
      })
    })

    it('answers 413 in the envelope over the body limit and writes nothing', async () => {
      const response = await drop([['big.png', 'x'.repeat(4096)]], {
        limit: 1024,
      })

      expect(response.status).toBe(413)
      expect(await response.json()).toMatchObject({
        ok: false,
        error: { code: 'asset-too-large' },
      })
      expect(existsSync(join(board.root, 'webapp/assets'))).toBe(false)
    })
  })

  function asset(path: string): string {
    return join(board.root, 'webapp/assets', path)
  }

  function writeAsset(path: string, content: string): void {
    mkdirSync(join(asset(path), '..'), { recursive: true })
    writeFileSync(asset(path), content)
  }

  function frame(path: string): string {
    return join(board.root, 'webapp', path)
  }

  function write(
    method: 'DELETE' | 'PATCH' | 'PUT',
    path: string,
    {
      token = TOKEN as string | null,
      body = undefined as BodyInit | undefined,
      project = 'webapp',
    } = {},
  ) {
    return routes().request(`/api/projects/${project}/assets/${path}`, {
      method,
      headers: token === null ? {} : { authorization: `Bearer ${token}` },
      body,
    })
  }

  describe('GET a file', () => {
    it('answers the frames linking it, each by ref', async () => {
      writeAsset('lake.jpg', 'pixels')
      writeFileSync(frame('home/hero.html'), '<img src="../assets/lake.jpg">')

      const response = await routes().request(
        '/api/projects/webapp/assets/lake.jpg',
      )

      expect(await response.json()).toEqual({
        ok: true,
        data: { path: 'lake.jpg', frames: ['webapp/home/hero'] },
      })
    })

    it('answers no frames for a file no frame links', async () => {
      writeAsset('lake.jpg', 'pixels')

      const response = await routes().request(
        '/api/projects/webapp/assets/lake.jpg',
      )

      expect((await response.json()).data.frames).toEqual([])
    })
  })

  describe('DELETE', () => {
    it('deletes the file and answers its path', async () => {
      writeAsset('lake.jpg', 'pixels')

      const response = await write('DELETE', 'lake.jpg')

      expect(await response.json()).toEqual({
        ok: true,
        data: { path: 'lake.jpg', frames: [] },
      })
      expect(existsSync(asset('lake.jpg'))).toBe(false)
    })

    it('takes the license file with it, and one undo brings both back', async () => {
      writeAsset('lake.jpg', 'pixels')
      writeAsset('lake.jpg.license.json', '{"license":"CC0"}')

      await write('DELETE', 'lake.jpg')
      expect(existsSync(asset('lake.jpg.license.json'))).toBe(false)
      await history.undo()

      expect(readFileSync(asset('lake.jpg'), 'utf8')).toBe('pixels')
      expect(readFileSync(asset('lake.jpg.license.json'), 'utf8')).toBe(
        '{"license":"CC0"}',
      )
      expect(history.counts()).toEqual({ undo: 0, redo: 1 })
    })

    it('deletes a file in a subfolder named by encoded segments', async () => {
      writeAsset('img/my logo.svg', '<svg/>')

      const response = await write('DELETE', 'img/my%20logo.svg')

      expect(response.status).toBe(200)
      expect(existsSync(asset('img/my logo.svg'))).toBe(false)
    })

    it('answers 404 asset-not-found for a file that is not there and records nothing', async () => {
      const response = await write('DELETE', 'gone.png')

      expect(response.status).toBe(404)
      expect(await response.json()).toMatchObject({
        ok: false,
        error: { code: 'asset-not-found' },
      })
      expect(history.counts()).toEqual({ undo: 0, redo: 0 })
    })

    it('refuses an encoded path leaving the folder and leaves the file outside alone', async () => {
      writeFileSync(join(board.root, 'webapp/outside.css'), 'x')

      const response = await write('DELETE', '..%2Foutside.css')

      expect(response.status).toBe(404)
      expect(existsSync(join(board.root, 'webapp/outside.css'))).toBe(true)
    })

    it("refuses a kit's file, which the Theme tab owns", async () => {
      writeAsset('kits/clean/kit.css', 'x')

      const response = await write('DELETE', 'kits/clean/kit.css')

      expect(response.status).toBe(404)
      expect(existsSync(asset('kits/clean/kit.css'))).toBe(true)
    })

    it('refuses a caller that is not a writer with 401 and keeps the file', async () => {
      writeAsset('lake.jpg', 'pixels')

      const response = await write('DELETE', 'lake.jpg', { token: null })

      expect(response.status).toBe(401)
      expect(existsSync(asset('lake.jpg'))).toBe(true)
    })
  })

  function form(name: string, content: string): FormData {
    const body = new FormData()
    body.append('file', new File([content], name))
    return body
  }

  describe('PUT', () => {
    it('writes the new bytes under the same path', async () => {
      writeAsset('lake.jpg', 'old')

      const response = await write('PUT', 'lake.jpg', {
        body: form('sunset.jpeg', 'new'),
      })

      expect(await response.json()).toEqual({
        ok: true,
        data: { path: 'lake.jpg', frames: [] },
      })
      expect(readFileSync(asset('lake.jpg'), 'utf8')).toBe('new')
    })

    it('takes the license file out, and one undo brings back the old bytes and the license', async () => {
      writeAsset('lake.jpg', 'old')
      writeAsset('lake.jpg.license.json', '{"license":"CC0"}')

      await write('PUT', 'lake.jpg', { body: form('lake.jpg', 'new') })
      expect(existsSync(asset('lake.jpg.license.json'))).toBe(false)
      await history.undo()

      expect(readFileSync(asset('lake.jpg'), 'utf8')).toBe('old')
      expect(existsSync(asset('lake.jpg.license.json'))).toBe(true)
    })

    it('redoes a replace after its undo', async () => {
      writeAsset('lake.jpg', 'old')
      await write('PUT', 'lake.jpg', { body: form('lake.jpg', 'new') })
      await history.undo()

      await history.redo()

      expect(readFileSync(asset('lake.jpg'), 'utf8')).toBe('new')
    })

    it('drops the undo as overtaken when an agent rewrote the file since', async () => {
      writeAsset('lake.jpg', 'old')
      await write('PUT', 'lake.jpg', { body: form('lake.jpg', 'new') })
      writeFileSync(asset('lake.jpg'), 'agent')

      await expect(history.undo()).rejects.toMatchObject({
        code: 'undo-overtaken',
      })
      expect(readFileSync(asset('lake.jpg'), 'utf8')).toBe('agent')
    })

    it('refuses a file of another kind with 400 and keeps the old bytes', async () => {
      writeAsset('lake.jpg', 'old')

      const response = await write('PUT', 'lake.jpg', {
        body: form('clip.mp4', 'video'),
      })

      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({
        error: { code: 'asset-type-refused' },
      })
      expect(readFileSync(asset('lake.jpg'), 'utf8')).toBe('old')
      expect(history.counts()).toEqual({ undo: 0, redo: 0 })
    })

    it('answers 404 asset-not-found for a file that is not there', async () => {
      const response = await write('PUT', 'gone.jpg', {
        body: form('gone.jpg', 'new'),
      })

      expect(response.status).toBe(404)
      expect(existsSync(asset('gone.jpg'))).toBe(false)
    })

    it('answers 400 usage for a body with no file', async () => {
      writeAsset('lake.jpg', 'old')

      const response = await write('PUT', 'lake.jpg', { body: new FormData() })

      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({ error: { code: 'usage' } })
    })

    it('refuses a caller that is not a writer with 401', async () => {
      writeAsset('lake.jpg', 'old')

      const response = await write('PUT', 'lake.jpg', {
        token: null,
        body: form('lake.jpg', 'new'),
      })

      expect(response.status).toBe(401)
      expect(readFileSync(asset('lake.jpg'), 'utf8')).toBe('old')
    })
  })

  function rename(path: string, name: string) {
    return write('PATCH', path, {
      body: JSON.stringify({ name }),
    })
  }

  describe('PATCH', () => {
    it('moves the file and points a linking frame at the new name', async () => {
      writeAsset('lake.jpg', 'pixels')
      writeFileSync(
        frame('home/hero.html'),
        '<img src="../assets/lake.jpg" alt="Lake">',
      )

      const response = await rename('lake.jpg', 'shore.jpg')

      expect(await response.json()).toEqual({
        ok: true,
        data: { path: 'shore.jpg', frames: ['webapp/home/hero'] },
      })
      expect(existsSync(asset('lake.jpg'))).toBe(false)
      expect(readFileSync(asset('shore.jpg'), 'utf8')).toBe('pixels')
      expect(readFileSync(frame('home/hero.html'), 'utf8')).toBe(
        '<img src="../assets/shore.jpg" alt="Lake">',
      )
    })

    it('rewrites a style url and a srcset candidate, keeping a query and the other candidates', async () => {
      writeAsset('lake.jpg', 'pixels')
      writeAsset('lake-2x.jpg', 'pixels')
      writeFileSync(
        frame('home/hero.html'),
        '<style>.a { background: url("../assets/lake.jpg?v=2") }</style><img srcset="../assets/lake.jpg 1x, ../assets/lake-2x.jpg 2x">',
      )

      await rename('lake.jpg', 'shore.jpg')

      expect(readFileSync(frame('home/hero.html'), 'utf8')).toBe(
        '<style>.a { background: url("../assets/shore.jpg?v=2") }</style><img srcset="../assets/shore.jpg 1x, ../assets/lake-2x.jpg 2x">',
      )
    })

    it('renames an element still named after the old file', async () => {
      writeAsset('beep.wav', 'sound')
      writeFileSync(
        frame('home/hero.html'),
        '<audio data-name="beep.wav" src="../assets/beep.wav" controls></audio>',
      )

      await rename('beep.wav', 'chime.wav')

      expect(readFileSync(frame('home/hero.html'), 'utf8')).toBe(
        '<audio data-name="chime.wav" src="../assets/chime.wav" controls></audio>',
      )
    })

    it('keeps a name set by hand on a renamed file', async () => {
      writeAsset('lake.jpg', 'pixels')
      writeFileSync(
        frame('home/hero.html'),
        '<img data-name="Hero" src="../assets/lake.jpg">',
      )

      await rename('lake.jpg', 'shore.jpg')

      expect(readFileSync(frame('home/hero.html'), 'utf8')).toBe(
        '<img data-name="Hero" src="../assets/shore.jpg">',
      )
    })

    it('leaves an element named like the file alone when it loads another', async () => {
      writeAsset('lake.jpg', 'pixels')
      writeAsset('old/lake.jpg', 'other')
      writeFileSync(
        frame('home/hero.html'),
        '<img data-name="lake.jpg" src="../assets/lake.jpg"><img data-name="lake.jpg" src="../assets/old/lake.jpg">',
      )

      await rename('lake.jpg', 'shore.jpg')

      expect(readFileSync(frame('home/hero.html'), 'utf8')).toBe(
        '<img data-name="shore.jpg" src="../assets/shore.jpg"><img data-name="lake.jpg" src="../assets/old/lake.jpg">',
      )
    })

    it('adds no name to a renamed element that had none', async () => {
      writeAsset('lake.jpg', 'pixels')
      writeFileSync(frame('home/hero.html'), '<img src="../assets/lake.jpg">')

      await rename('lake.jpg', 'shore.jpg')

      expect(readFileSync(frame('home/hero.html'), 'utf8')).toBe(
        '<img src="../assets/shore.jpg">',
      )
    })

    it('moves the license file with it', async () => {
      writeAsset('lake.jpg', 'pixels')
      writeAsset('lake.jpg.license.json', '{}')

      await rename('lake.jpg', 'shore.jpg')

      expect(existsSync(asset('shore.jpg.license.json'))).toBe(true)
      expect(existsSync(asset('lake.jpg.license.json'))).toBe(false)
    })

    it('undoes the move, the license, and the frame rewrite in one step', async () => {
      writeAsset('lake.jpg', 'pixels')
      writeAsset('lake.jpg.license.json', '{}')
      writeFileSync(frame('home/hero.html'), '<img src="../assets/lake.jpg">')
      await rename('lake.jpg', 'shore.jpg')

      await history.undo()

      expect(existsSync(asset('lake.jpg'))).toBe(true)
      expect(existsSync(asset('lake.jpg.license.json'))).toBe(true)
      expect(existsSync(asset('shore.jpg'))).toBe(false)
      expect(readFileSync(frame('home/hero.html'), 'utf8')).toBe(
        '<img src="../assets/lake.jpg">',
      )
      expect(history.counts()).toEqual({ undo: 0, redo: 1 })
    })

    it('drops the undo as overtaken when an agent rewrote a linking frame since, leaving its write', async () => {
      writeAsset('lake.jpg', 'pixels')
      writeFileSync(frame('home/hero.html'), '<img src="../assets/lake.jpg">')
      await rename('lake.jpg', 'shore.jpg')
      writeFileSync(frame('home/hero.html'), '<p>agent</p>')

      await expect(history.undo()).rejects.toMatchObject({
        code: 'undo-overtaken',
      })
      expect(readFileSync(frame('home/hero.html'), 'utf8')).toBe('<p>agent</p>')
      expect(existsSync(asset('shore.jpg'))).toBe(true)
    })

    it('refuses a name another file holds in any case as 409 name-taken, moving nothing', async () => {
      writeAsset('lake.jpg', 'a')
      writeAsset('Shore.jpg', 'b')

      const response = await rename('lake.jpg', 'shore.jpg')

      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({
        error: { code: 'name-taken' },
      })
      expect(readFileSync(asset('lake.jpg'), 'utf8')).toBe('a')
    })

    it('takes a case-only rename of the same file', async () => {
      writeAsset('lake.jpg', 'a')

      const response = await rename('lake.jpg', 'Lake.jpg')

      expect(response.status).toBe(200)
      expect(readFileSync(asset('Lake.jpg'), 'utf8')).toBe('a')
    })

    it('refuses a name changing the extension as 400 invalid-name', async () => {
      writeAsset('lake.jpg', 'a')

      const response = await rename('lake.jpg', 'lake.png')

      expect(response.status).toBe(400)
      expect(await response.json()).toMatchObject({
        error: { code: 'invalid-name' },
      })
      expect(existsSync(asset('lake.jpg'))).toBe(true)
    })

    it('refuses a name off the board rule as 400 invalid-name', async () => {
      writeAsset('lake.jpg', 'a')

      const response = await rename('lake.jpg', '../lake.jpg')

      expect(response.status).toBe(400)
      expect(existsSync(asset('lake.jpg'))).toBe(true)
    })

    it('refuses as 409 asset-held naming the session when a linking frame is claimed, writing nothing', async () => {
      writeAsset('lake.jpg', 'pixels')
      writeFileSync(frame('home/hero.html'), '<img src="../assets/lake.jpg">')
      await claim(
        board.root,
        {
          frame: 'webapp/home/hero',
          session: 'sess-a',
          agent: 'claude',
          tag: 'claude · webapp',
        },
        new Date(),
      )

      const response = await rename('lake.jpg', 'shore.jpg')

      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({
        error: { code: 'asset-held', details: { tag: 'claude · webapp' } },
      })
      expect(existsSync(asset('lake.jpg'))).toBe(true)
      expect(readFileSync(frame('home/hero.html'), 'utf8')).toBe(
        '<img src="../assets/lake.jpg">',
      )
    })

    it('answers 404 asset-not-found for a file that is not there', async () => {
      const response = await rename('gone.jpg', 'shore.jpg')

      expect(response.status).toBe(404)
    })

    it('refuses a caller that is not a writer with 401', async () => {
      writeAsset('lake.jpg', 'a')

      const response = await write('PATCH', 'lake.jpg', {
        token: null,
        body: JSON.stringify({ name: 'shore.jpg' }),
      })

      expect(response.status).toBe(401)
      expect(existsSync(asset('lake.jpg'))).toBe(true)
    })
  })

  describe('GET transitions', () => {
    function writeTransition(name: string, css: string): void {
      mkdirSync(join(board.root, 'webapp/assets/transitions'), {
        recursive: true,
      })
      writeFileSync(
        join(board.root, `webapp/assets/transitions/${name}.css`),
        css,
      )
    }

    it('answers each transition by name with its keyframes renamed for the project', async () => {
      writeTransition(
        'wipe',
        '/* mine */ @keyframes enter { from { opacity: 0 } }\n@keyframes leave { to { opacity: 0 } }',
      )

      const response = await routes().request(
        '/api/projects/webapp/transitions',
      )

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({
        ok: true,
        data: {
          transitions: [
            {
              name: 'wipe',
              css: '@keyframes fb-own-webapp--wipe-enter { from { opacity: 0 } }\n@keyframes fb-own-webapp--wipe-leave { to { opacity: 0 } }',
            },
          ],
        },
      })
    })

    it('leaves a refused file out and answers none of its bytes', async () => {
      writeTransition(
        'wipe',
        '@keyframes enter { from { opacity: 0 } } body { display: none }',
      )

      const response = await routes().request(
        '/api/projects/webapp/transitions',
      )

      expect(await response.json()).toEqual({
        ok: true,
        data: { transitions: [] },
      })
    })

    it('answers 404 for a project that does not exist', async () => {
      const response = await routes().request('/api/projects/nope/transitions')

      expect(response.status).toBe(404)
      expect(await response.json()).toMatchObject({
        ok: false,
        error: { code: 'project-not-found' },
      })
    })
  })
})
