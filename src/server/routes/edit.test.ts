import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../../test/support/fixture-board'
import { skeleton } from '../board/frames'
import { checkPage } from '../checks/run'
import { claim, release } from '../claims/store'
import { contentHash } from '../edit/address'
import { editFrameFile } from '../edit/frame-file'
import { History } from '../history/stack'
import { editRoutes } from './edit'

const TOKEN = 'a'.repeat(64)
const HERO = 'webapp/home/hero'
/** The `<h1>` in the fixture's hero, by `querySelectorAll('*')` order. */
const HEADLINE = 5
const CAPTION = 6

describe('editRoutes', () => {
  let board: FixtureBoard
  let history: History

  beforeEach(() => {
    board = copyFixtureBoard('basic')
    history = new History(board.root)
  })

  afterEach(() => {
    board.cleanup()
  })

  const path = () => join(board.root, `${HERO}.html`)
  const read = () => readFileSync(path(), 'utf8')
  const hash = () => contentHash(readFileSync(path()))

  /** The sources an agent write replaced, as the change tracker keeps them by ref and hash. */
  let kept: Map<string, string>
  /** The hashes the route asked the kept sources for. */
  let asked: string[]

  beforeEach(() => {
    kept = new Map()
    asked = []
  })

  /** Writes the file as an agent would, keeping the source it replaced. */
  function agentWrites(next: string) {
    kept.set(`${HERO}\n${hash()}`, read())
    writeFileSync(path(), next)
  }

  function post(body: unknown, authorized = true) {
    return editRoutes(
      board.root,
      {
        token: () => TOKEN,
        key: 'b'.repeat(64),
        cookieName: 'frameboard-key-111111111111',
        isOwnOrigin: () => false,
      },
      history,
      async (ref, at) => {
        asked.push(at)
        return kept.get(`${ref}\n${at}`) ?? null
      },
    ).request('/api/frames/edit', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(authorized ? { authorization: `Bearer ${TOKEN}` } : {}),
      },
      body: JSON.stringify(body),
    })
  }

  it('refuses a request with no writer and writes nothing', async () => {
    const original = read()

    const response = await post(
      {
        ref: HERO,
        index: HEADLINE,
        hash: hash(),
        change: { kind: 'text', value: 'Welcome' },
      },
      false,
    )

    expect(response.status).toBe(401)
    expect(read()).toBe(original)
  })

  describe('a frame another session holds', () => {
    const holder = {
      frame: HERO,
      session: 'sess-a',
      agent: 'claude',
      tag: 'claude · webapp',
    }
    const opacity = () => ({
      ref: HERO,
      index: HEADLINE,
      hash: hash(),
      change: { kind: 'style', property: 'opacity', value: '0.5' },
    })

    beforeEach(async () => {
      await claim(board.root, holder, new Date())
    })

    it('refuses the edit as frame-claimed, writing and recording nothing', async () => {
      const original = read()

      const response = await post(opacity())

      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({
        ok: false,
        error: { code: 'frame-claimed', details: { frame: HERO } },
      })
      expect(read()).toBe(original)
      expect(history.counts()).toEqual({ undo: 0, redo: 0 })
    })

    it('writes the edit once the claim is released', async () => {
      await release(board.root, holder.session, undefined, new Date())

      const response = await post(opacity())

      expect(response.status).toBe(200)
      expect(read()).toContain('style="opacity: 0.5"')
    })
  })

  it('writes one declaration into the element’s style', async () => {
    const original = read()

    await post({
      ref: HERO,
      index: HEADLINE,
      hash: hash(),
      change: { kind: 'style', property: 'opacity', value: '0.5' },
    })

    expect(read()).toBe(
      original.replace(
        '<h1 data-name="Headline">',
        '<h1 data-name="Headline" style="opacity: 0.5">',
      ),
    )
  })

  it('writes several declarations as one step an undo puts back', async () => {
    const original = read()

    const response = await post({
      ref: HERO,
      index: HEADLINE,
      hash: hash(),
      change: {
        kind: 'styles',
        declarations: [
          { property: 'width', value: '240px' },
          { property: 'height', value: '120px' },
        ],
      },
    })

    expect(response.status).toBe(200)
    expect(read()).toContain(
      '<h1 data-name="Headline" style="width: 240px; height: 120px">',
    )
    expect(history.counts().undo).toBe(1)
    await history.undo()
    expect(read()).toBe(original)
  })

  it('writes one attribute', async () => {
    const original = read()

    await post({
      ref: HERO,
      index: HEADLINE,
      hash: hash(),
      change: { kind: 'attribute', name: 'data-name', value: 'Title' },
    })

    expect(read()).toBe(
      original.replace('data-name="Headline"', 'data-name="Title"'),
    )
  })

  it('writes the text and answers the hash it left', async () => {
    const original = read()
    const readFrom = hash()

    const response = await post({
      ref: HERO,
      index: HEADLINE,
      hash: readFrom,
      change: { kind: 'text', value: 'Welcome' },
    })

    expect(read()).toBe(original.replace('>hero</h1>', '>Welcome</h1>'))
    expect(await response.json()).toEqual({
      ok: true,
      data: { ref: HERO, index: HEADLINE, hash: hash(), from: readFrom },
    })
  })

  it('asks for no kept source while the hash still matches the file', async () => {
    await post({
      ref: HERO,
      index: HEADLINE,
      hash: hash(),
      change: { kind: 'text', value: 'Welcome' },
    })

    expect(asked).toEqual([])
  })

  describe('an edit made before an agent wrote the frame', () => {
    it('lands past the agent’s write to another element, keeping it', async () => {
      const readFrom = hash()
      agentWrites(read().replace('Caption', 'Byline'))
      const agent = hash()

      const response = await post({
        ref: HERO,
        index: HEADLINE,
        hash: readFrom,
        change: { kind: 'text', value: 'Welcome' },
      })

      expect(read()).toContain('>Welcome</h1>')
      expect(read()).toContain('Byline')
      expect(await response.json()).toEqual({
        ok: true,
        data: { ref: HERO, index: HEADLINE, hash: hash(), from: agent },
      })
    })

    it('answers the index it landed at once the agent added an element above', async () => {
      const readFrom = hash()
      agentWrites(read().replace('<h1', '<hr><h1'))

      const response = await post({
        ref: HERO,
        index: HEADLINE,
        hash: readFrom,
        change: { kind: 'text', value: 'Welcome' },
      })

      expect(read()).toContain('<hr><h1 data-name="Headline">Welcome</h1>')
      expect(await response.json()).toMatchObject({
        ok: true,
        data: { index: HEADLINE + 1 },
      })
    })

    it('refuses stale-address once the agent changed the edited element', async () => {
      const readFrom = hash()
      agentWrites(read().replace('>hero</h1>', '>Hero</h1>'))
      const agent = read()

      const response = await post({
        ref: HERO,
        index: HEADLINE,
        hash: readFrom,
        change: { kind: 'text', value: 'Welcome' },
      })

      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({
        ok: false,
        error: { code: 'stale-address', details: { moved: false } },
      })
      expect(read()).toBe(agent)
    })

    it('refuses stale-address when no version of the frame is kept', async () => {
      const readFrom = hash()
      writeFileSync(path(), read().replace('Caption', 'Byline'))
      const agent = read()

      const response = await post({
        ref: HERO,
        index: HEADLINE,
        hash: readFrom,
        change: { kind: 'text', value: 'Welcome' },
      })

      expect(response.status).toBe(409)
      expect(read()).toBe(agent)
    })
  })

  it('records one step per edit, which undo reverts byte for byte', async () => {
    const original = read()
    await post({
      ref: HERO,
      index: HEADLINE,
      hash: hash(),
      change: { kind: 'text', value: 'Welcome' },
    })
    await post({
      ref: HERO,
      index: HEADLINE,
      hash: hash(),
      change: { kind: 'style', property: 'opacity', value: '0.5' },
    })

    expect(history.counts().undo).toBe(2)
    await history.undo()
    await history.undo()
    expect(read()).toBe(original)
  })

  it('undoes the edit after an agent wrote another element, keeping its bytes', async () => {
    await post({
      ref: HERO,
      index: HEADLINE,
      hash: hash(),
      change: { kind: 'text', value: 'Welcome' },
    })
    const agent = editFrameFile(
      path(),
      { index: CAPTION },
      { kind: 'attribute', name: 'title', value: 'agent' },
    )
    if (!agent.ok) throw new Error(agent.detail)

    const answer = await history.undo()

    expect(read()).toContain('<h1 data-name="Headline">hero</h1>')
    expect(read()).toContain('<p data-name="Caption" title="agent">')
    expect(answer.hashes).toEqual({ [HERO]: hash() })
  })

  it('records nothing for a refused edit', async () => {
    await post({
      ref: HERO,
      index: HEADLINE,
      hash: 'c'.repeat(64),
      change: { kind: 'text', value: 'Welcome' },
    })

    expect(history.counts().undo).toBe(0)
  })

  it('records nothing for an edit that leaves the bytes as they were', async () => {
    const original = read()

    await post({
      ref: HERO,
      index: HEADLINE,
      hash: hash(),
      change: { kind: 'attribute', name: 'data-name', value: 'Headline' },
    })

    expect(read()).toBe(original)
    expect(history.counts().undo).toBe(0)
  })

  describe('POST /api/frames/insert', () => {
    /** The hero's body, which a placed element goes into. */
    const BODY = 4

    function insert(body: unknown) {
      return editRoutes(
        board.root,
        {
          token: () => TOKEN,
          key: 'b'.repeat(64),
          cookieName: 'frameboard-key-111111111111',
          isOwnOrigin: () => false,
        },
        history,
        undefined,
        (project) => ({
          board: join(board.root, 'tokens.css'),
          project: join(board.root, project, 'tokens.css'),
        }),
      ).request('/api/frames/insert', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${TOKEN}`,
        },
        body: JSON.stringify(body),
      })
    }

    const rectangle = () => ({
      ref: HERO,
      hash: hash(),
      parent: BODY,
      before: CAPTION,
      element: { kind: 'rectangle' },
    })

    it('writes the one tag before the named child and answers where it landed', async () => {
      const original = read()

      const response = await insert(rectangle())

      expect(await response.json()).toEqual({
        ok: true,
        data: { ref: HERO, index: CAPTION, hash: hash() },
      })
      expect(read()).toBe(
        original.replace(
          '<p data-name="Caption">',
          '<div data-name="Rectangle" style="width: 100px; height: 100px; background: var(--muted)"></div><p data-name="Caption">',
        ),
      )
    })

    it('places text a new frame checks clean on default-font', async () => {
      writeFileSync(path(), skeleton('hero'))

      await insert({
        ref: HERO,
        hash: hash(),
        parent: BODY,
        before: null,
        element: { kind: 'text' },
      })

      const { findings } = await checkPage(board.root, 'webapp', 'home')
      expect(
        findings.filter(
          (finding) =>
            finding.frame === HERO && finding.rule === 'default-font',
        ),
      ).toEqual([])
    })

    it('records one step, which undo reverts byte for byte', async () => {
      const original = read()
      await insert(rectangle())

      expect(history.counts().undo).toBe(1)
      await history.undo()

      expect(read()).toBe(original)
    })

    it('refuses stale-address once the file moved, writing nothing', async () => {
      const sent = rectangle()
      agentWrites(read().replace('hero</h1>', 'Agent</h1>'))
      const agent = read()

      const response = await insert(sent)

      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({
        ok: false,
        error: { code: 'stale-address' },
      })
      expect(read()).toBe(agent)
      expect(history.counts().undo).toBe(0)
    })

    it('refuses a parent that cannot hold an element as invalid-container', async () => {
      const response = await insert({ ...rectangle(), parent: 1, before: null })

      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({
        ok: false,
        error: { code: 'invalid-container' },
      })
    })

    it('refuses a frame another session holds as frame-claimed', async () => {
      const original = read()
      await claim(
        board.root,
        {
          frame: HERO,
          session: 'sess-a',
          agent: 'claude',
          tag: 'claude · webapp',
        },
        new Date(),
      )

      const response = await insert(rectangle())

      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({
        ok: false,
        error: { code: 'frame-claimed' },
      })
      expect(read()).toBe(original)
    })

    it('refuses an element kind it does not know as usage', async () => {
      const response = await insert({
        ...rectangle(),
        element: { kind: 'image' },
      })

      expect(response.status).toBe(400)
    })

    it('writes the width and height a drag gave a shape', async () => {
      await insert({
        ...rectangle(),
        element: { kind: 'ellipse', width: 240, height: 48 },
      })

      expect(read()).toContain(
        '<div data-name="Ellipse" style="width: 240px; height: 48px; background: var(--muted); border-radius: 50%"></div>',
      )
    })

    it('refuses a size under one pixel as usage', async () => {
      const response = await insert({
        ...rectangle(),
        element: { kind: 'rectangle', width: 0, height: 48 },
      })

      expect(response.status).toBe(400)
    })
  })

  describe('POST /api/frames/move', () => {
    const BODY = 4

    function move(body: unknown) {
      return editRoutes(
        board.root,
        {
          token: () => TOKEN,
          key: 'b'.repeat(64),
          cookieName: 'frameboard-key-111111111111',
          isOwnOrigin: () => false,
        },
        history,
      ).request('/api/frames/move', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${TOKEN}`,
        },
        body: JSON.stringify(body),
      })
    }

    const headlineToEnd = () => ({
      ref: HERO,
      hash: hash(),
      index: HEADLINE,
      parent: BODY,
      before: null,
    })

    it('moves the element into the gap and answers where it landed', async () => {
      const original = read()

      const response = await move(headlineToEnd())

      expect(await response.json()).toEqual({
        ok: true,
        data: { ref: HERO, index: 7, hash: hash() },
      })
      expect(read()).toBe(
        original
          .replace('<h1 data-name="Headline">hero</h1>', '')
          .replace(
            '\n  </body>',
            '\n  <h1 data-name="Headline">hero</h1></body>',
          ),
      )
    })

    it('records one step, which undo reverts byte for byte', async () => {
      const original = read()
      await move(headlineToEnd())

      expect(history.counts().undo).toBe(1)
      await history.undo()

      expect(read()).toBe(original)
    })

    it('moves the element again on a redo', async () => {
      await move(headlineToEnd())
      const moved = read()
      await history.undo()

      await history.redo()

      expect(read()).toBe(moved)
    })

    it('refuses stale-address once the file moved, writing nothing', async () => {
      const sent = headlineToEnd()
      agentWrites(read().replace('hero</h1>', 'Agent</h1>'))
      const agent = read()

      const response = await move(sent)

      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({
        ok: false,
        error: { code: 'stale-address' },
      })
      expect(read()).toBe(agent)
      expect(history.counts().undo).toBe(0)
    })

    it('refuses a gap inside the moved element as invalid-container', async () => {
      const original = read()

      const response = await move({
        ...headlineToEnd(),
        index: CAPTION,
        parent: CAPTION,
      })

      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({
        ok: false,
        error: { code: 'invalid-container' },
      })
      expect(read()).toBe(original)
    })

    it('refuses a frame another session holds as frame-claimed', async () => {
      const original = read()
      await claim(
        board.root,
        {
          frame: HERO,
          session: 'sess-a',
          agent: 'claude',
          tag: 'claude · webapp',
        },
        new Date(),
      )

      const response = await move(headlineToEnd())

      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({
        ok: false,
        error: { code: 'frame-claimed' },
      })
      expect(read()).toBe(original)
    })
  })

  describe('POST /api/frames/remove', () => {
    function remove(body: unknown) {
      return editRoutes(
        board.root,
        {
          token: () => TOKEN,
          key: 'b'.repeat(64),
          cookieName: 'frameboard-key-111111111111',
          isOwnOrigin: () => false,
        },
        history,
      ).request('/api/frames/remove', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${TOKEN}`,
        },
        body: JSON.stringify(body),
      })
    }

    it('takes out the element and answers the hash it wrote', async () => {
      const response = await remove({ ref: HERO, index: CAPTION, hash: hash() })

      expect(await response.json()).toEqual({
        ok: true,
        data: { ref: HERO, hash: hash() },
      })
      expect(read()).not.toContain('data-name="Caption"')
    })

    it('records one step, which undo brings the element back by', async () => {
      await remove({ ref: HERO, index: CAPTION, hash: hash() })

      expect(history.counts().undo).toBe(1)
      await history.undo()

      expect(read()).toContain('data-name="Caption"')
    })

    it('refuses stale-address once the file moved, writing nothing', async () => {
      const sent = { ref: HERO, index: CAPTION, hash: hash() }
      agentWrites(read().replace('hero</h1>', 'Agent</h1>'))
      const agent = read()

      const response = await remove(sent)

      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({
        ok: false,
        error: { code: 'stale-address' },
      })
      expect(read()).toBe(agent)
      expect(history.counts().undo).toBe(0)
    })

    it('refuses an index outside the body as invalid-address', async () => {
      const response = await remove({ ref: HERO, index: 1, hash: hash() })

      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({
        ok: false,
        error: { code: 'invalid-address' },
      })
    })

    it('refuses a frame another session holds as frame-claimed', async () => {
      const original = read()
      await claim(
        board.root,
        {
          frame: HERO,
          session: 'sess-a',
          agent: 'claude',
          tag: 'claude · webapp',
        },
        new Date(),
      )

      const response = await remove({ ref: HERO, index: CAPTION, hash: hash() })

      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({
        ok: false,
        error: { code: 'frame-claimed' },
      })
      expect(read()).toBe(original)
    })
  })
})
