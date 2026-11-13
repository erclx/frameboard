import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../../test/support/fixture-board'
import { skeleton } from '../board/frames'
import { checkPage } from '../checks/run'
import { claim, release } from '../claims/store'
import { contentHash, parseFrame } from '../edit/address'
import { editFrameFile } from '../edit/frame-file'
import { History } from '../history/stack'
import { resolveAnchors } from '../notes/anchor'
import { readNotes } from '../notes/store'
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

  it('drops one attribute', async () => {
    const original = read()

    const response = await post({
      ref: HERO,
      index: HEADLINE,
      hash: hash(),
      change: { kind: 'attribute', name: 'data-name', remove: true },
    })

    expect(response.status).toBe(200)
    expect(read()).toBe(original.replace(' data-name="Headline"', ''))
  })

  it('refuses an attribute change naming a value and a removal together, writing nothing', async () => {
    const original = read()

    const response = await post({
      ref: HERO,
      index: HEADLINE,
      hash: hash(),
      change: {
        kind: 'attribute',
        name: 'data-name',
        value: '',
        remove: true,
      },
    })

    expect(response.status).toBe(400)
    expect(read()).toBe(original)
  })

  it('leaves the hash as it was when the dropped attribute is absent', async () => {
    const readFrom = hash()

    const response = await post({
      ref: HERO,
      index: HEADLINE,
      hash: readFrom,
      change: { kind: 'attribute', name: 'muted', remove: true },
    })

    expect(await response.json()).toMatchObject({
      ok: true,
      data: { hash: readFrom, from: readFrom },
    })
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

  describe('a batch of edits', () => {
    const fades = () => ({
      ref: HERO,
      hash: hash(),
      edits: [
        {
          index: HEADLINE,
          change: { kind: 'style', property: 'opacity', value: '0.5' },
        },
        {
          index: CAPTION,
          change: { kind: 'style', property: 'opacity', value: '0.25' },
        },
      ],
    })

    it('writes every element and answers each index in the order sent', async () => {
      const from = hash()

      const response = await post(fades())

      expect(read()).toContain('<h1 data-name="Headline" style="opacity: 0.5">')
      expect(read()).toContain('<p data-name="Caption" style="opacity: 0.25">')
      expect(await response.json()).toEqual({
        ok: true,
        data: {
          ref: HERO,
          index: CAPTION,
          indexes: [HEADLINE, CAPTION],
          hash: hash(),
          from,
        },
      })
    })

    it('lands as one step that one undo puts back byte for byte', async () => {
      const original = read()

      await post(fades())

      expect(history.counts().undo).toBe(1)
      await history.undo()
      expect(read()).toBe(original)
    })

    it('refuses whole on one bad index, writing and recording nothing', async () => {
      const original = read()
      const body = fades()

      const response = await post({
        ...body,
        edits: [...body.edits, { index: 999, change: body.edits[0]?.change }],
      })

      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({
        ok: false,
        error: { code: 'invalid-address' },
      })
      expect(read()).toBe(original)
      expect(history.counts().undo).toBe(0)
    })

    it('writes a text and a style change on one element as one undo step', async () => {
      const original = read()

      const response = await post({
        ref: HERO,
        hash: hash(),
        edits: [
          { index: HEADLINE, change: { kind: 'text', value: 'One\nTwo' } },
          {
            index: HEADLINE,
            change: {
              kind: 'style',
              property: 'white-space',
              value: 'pre-line',
            },
          },
        ],
      })

      expect(response.status).toBe(200)
      expect(read()).toContain(
        '<h1 data-name="Headline" style="white-space: pre-line">One\nTwo</h1>',
      )
      expect(history.counts().undo).toBe(1)
      await history.undo()
      expect(read()).toBe(original)
    })

    it('refuses one element named twice by two style changes', async () => {
      const original = read()
      const body = fades()
      const [first] = body.edits

      const response = await post({ ...body, edits: [first, first] })

      expect(await response.json()).toMatchObject({
        ok: false,
        error: { code: 'invalid-edit' },
      })
      expect(read()).toBe(original)
    })

    it('finds each again past an agent write elsewhere in the frame', async () => {
      const body = fades()
      agentWrites(
        read().replace(
          '<h1 data-name="Headline"',
          '<hr />\n    <h1 data-name="Headline"',
        ),
      )

      const response = await post(body)

      expect(await response.json()).toMatchObject({
        ok: true,
        data: { indexes: [HEADLINE + 1, CAPTION + 1] },
      })
      expect(read()).toContain('<hr />')
    })

    it('refuses a body with an empty list', async () => {
      const response = await post({ ref: HERO, hash: hash(), edits: [] })

      expect(response.status).toBe(400)
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

    it('keeps a note pinned on the child it went before on that child', async () => {
      const page = join(board.root, 'webapp/home')
      const notes = join(page, 'notes.json')
      const pinned = (await readNotes(notes)).notes[0]
      if (!pinned) throw new Error('the fixture carries no note')
      writeFileSync(
        notes,
        JSON.stringify({
          version: 1,
          notes: [
            {
              ...pinned,
              frame: 'hero',
              anchor: { index: CAPTION, hash: hash() },
            },
          ],
        }),
      )

      await insert(rectangle())

      await expect(
        resolveAnchors(page, (await readNotes(notes)).notes),
      ).resolves.toEqual({ [pinned.id]: CAPTION + 1 })
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

    describe('at a spot', () => {
      /** A static `<div>` in the body, holding one heading, by `querySelectorAll('*')` order. */
      const BOX = 5
      const BOXED =
        '<!doctype html>\n<html><head><meta charset="utf-8"><title>hero</title></head><body><div data-name="Box"><h1>Hi</h1></div></body></html>\n'

      it('writes the shape out of the flow at the spot inside body, leaving body as it was', async () => {
        const original = read()

        const response = await insert({
          ...rectangle(),
          at: { left: 40, top: 24 },
        })

        expect(response.status).toBe(200)
        expect(read()).toBe(
          original.replace(
            '<p data-name="Caption">',
            '<div data-name="Rectangle" style="width: 100px; height: 100px; background: var(--muted); position: absolute; left: 40px; top: 24px"></div><p data-name="Caption">',
          ),
        )
      })

      it('writes relative on a static parent and the shape in one write', async () => {
        writeFileSync(path(), BOXED)

        const response = await insert({
          ref: HERO,
          hash: hash(),
          parent: BOX,
          before: null,
          element: { kind: 'rectangle', width: 60, height: 30 },
          at: { left: 8, top: 12.5 },
        })

        expect(await response.json()).toEqual({
          ok: true,
          data: { ref: HERO, index: 7, hash: hash() },
        })
        expect(read()).toBe(
          BOXED.replace(
            '<div data-name="Box"><h1>Hi</h1></div>',
            '<div data-name="Box" style="position: relative"><h1>Hi</h1><div data-name="Rectangle" style="width: 60px; height: 30px; background: var(--muted); position: absolute; left: 8px; top: 12.5px"></div></div>',
          ),
        )
      })

      it('records the shape and its parent as one step, which one undo takes out and a redo puts back', async () => {
        writeFileSync(path(), BOXED)
        await insert({
          ref: HERO,
          hash: hash(),
          parent: BOX,
          before: null,
          element: { kind: 'rectangle' },
          at: { left: 8, top: 12 },
        })
        const placed = read()

        expect(history.counts().undo).toBe(1)
        await history.undo()
        expect(read()).toBe(BOXED)
        await history.redo()

        expect(read()).toBe(placed)
      })

      describe('in a static parent holding an element anchored above it', () => {
        /** The static Box, whose badge anchors to the relative Card around it. */
        const INNER = 6
        const ANCHORED =
          '<!doctype html>\n<html><head><meta charset="utf-8"><title>hero</title></head><body><div data-name="Card" style="position: relative"><div data-name="Box"><h1>Hi</h1><span data-name="Badge" style="position: absolute; top: 0">x</span></div></div></body></html>\n'

        const into = (at: Record<string, unknown>) => ({
          ref: HERO,
          hash: hash(),
          parent: INNER,
          before: null,
          element: { kind: 'rectangle' },
          at,
        })

        it('refuses reanchors-descendant, writing nothing', async () => {
          writeFileSync(path(), ANCHORED)

          const response = await insert(into({ left: 8, top: 12 }))

          expect(response.status).toBe(409)
          expect(await response.json()).toMatchObject({
            error: { code: 'reanchors-descendant' },
          })
          expect(read()).toBe(ANCHORED)
        })

        it('joins the flow at the gap instead under orFlow', async () => {
          writeFileSync(path(), ANCHORED)

          const response = await insert(
            into({ left: 8, top: 12, orFlow: true }),
          )

          expect(response.status).toBe(200)
          expect(read()).toBe(
            ANCHORED.replace(
              'x</span></div>',
              'x</span><div data-name="Rectangle" style="width: 100px; height: 100px; background: var(--muted)"></div></div>',
            ),
          )
        })
      })

      it('writes text with no margin, so it sits at the spot', async () => {
        await insert({
          ...rectangle(),
          element: { kind: 'text' },
          at: { left: 40, top: 24 },
        })

        expect(read()).toContain(
          '<p data-name="Text" style="font-family: var(--font-text); width: fit-content; margin: 0; position: absolute; left: 40px; top: 24px">Text</p>',
        )
      })
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

    describe('an asset', () => {
      const assets = () => join(board.root, 'webapp', 'assets')

      function putAsset(name: string) {
        mkdirSync(assets(), { recursive: true })
        writeFileSync(join(assets(), name), 'x')
      }

      const asset = (path: string) => ({
        ...rectangle(),
        element: { kind: 'asset', path, width: 320, height: 180 },
      })

      it('writes one img for an image and one undo step', async () => {
        putAsset('hero.png')
        const original = read()

        const response = await insert(asset('hero.png'))

        expect(response.status).toBe(200)
        expect(read()).toBe(
          original.replace(
            '<p data-name="Caption">',
            '<img data-name="hero.png" src="../assets/hero.png" alt="" style="width: 320px; height: 180px; object-fit: cover"><p data-name="Caption">',
          ),
        )
        expect(history.counts().undo).toBe(1)
      })

      it('writes a video for a video file', async () => {
        putAsset('demo.mp4')

        await insert(asset('demo.mp4'))

        expect(read()).toContain(
          '<video data-name="demo.mp4" src="../assets/demo.mp4" autoplay muted loop playsinline',
        )
      })

      it('writes an audio player for an audio file', async () => {
        putAsset('voice.ogg')

        await insert(asset('voice.ogg'))

        expect(read()).toContain(
          '<audio data-name="voice.ogg" src="../assets/voice.ogg" controls style="width: 320px"></audio>',
        )
      })

      it('refuses a path out of the assets folder as asset-missing, writing nothing', async () => {
        putAsset('hero.png')
        const original = read()

        const response = await insert(asset('../home/hero.html'))

        expect(response.status).toBe(409)
        expect(await response.json()).toMatchObject({
          ok: false,
          error: { code: 'asset-missing' },
        })
        expect(read()).toBe(original)
        expect(history.counts().undo).toBe(0)
      })

      it('refuses a font as asset-not-placeable, writing nothing', async () => {
        putAsset('Inter.woff2')
        const original = read()

        const response = await insert(asset('Inter.woff2'))

        expect(response.status).toBe(409)
        expect(await response.json()).toMatchObject({
          ok: false,
          error: { code: 'asset-not-placeable' },
        })
        expect(read()).toBe(original)
        expect(history.counts().undo).toBe(0)
      })

      it('refuses an asset with no size as usage', async () => {
        putAsset('hero.png')

        const response = await insert({
          ...rectangle(),
          element: { kind: 'asset', path: 'hero.png' },
        })

        expect(response.status).toBe(400)
      })
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

  describe('POST /api/frames/wrap', () => {
    function wrap(body: unknown) {
      return editRoutes(
        board.root,
        {
          token: () => TOKEN,
          key: 'b'.repeat(64),
          cookieName: 'frameboard-key-111111111111',
          isOwnOrigin: () => false,
        },
        history,
      ).request('/api/frames/wrap', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${TOKEN}`,
        },
        body: JSON.stringify(body),
      })
    }

    // The headline at 5 and the caption at 6, holding its code at 7.
    const headlineAndCaption = () => ({
      ref: HERO,
      hash: hash(),
      indexes: [HEADLINE, 6],
      flow: { direction: 'column', gap: 8 },
      spot: null,
    })

    it('wraps both in one container and answers where each landed', async () => {
      const response = await wrap(headlineAndCaption())

      expect(await response.json()).toEqual({
        ok: true,
        data: { ref: HERO, index: 5, members: [6, 7], hash: hash() },
      })
      expect(read()).toContain(
        '<div style="display: flex; flex-direction: column; gap: 8px">\n      <h1 data-name="Headline">hero</h1>\n      <p data-name="Caption">',
      )
    })

    it('records one step, which undo reverts byte for byte', async () => {
      const original = read()
      await wrap(headlineAndCaption())

      expect(history.counts().undo).toBe(1)
      await history.undo()

      expect(read()).toBe(original)
    })

    it('wraps them again on redo', async () => {
      await wrap(headlineAndCaption())
      const wrapped = read()
      await history.undo()

      await history.redo()

      expect(read()).toBe(wrapped)
    })

    it('refuses a hash the file left and writes nothing', async () => {
      const original = read()

      const response = await wrap({
        ...headlineAndCaption(),
        hash: 'f'.repeat(64),
      })

      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({
        ok: false,
        error: { code: 'stale-address' },
      })
      expect(read()).toBe(original)
    })

    it('refuses elements that are not siblings', async () => {
      const response = await wrap({ ...headlineAndCaption(), indexes: [5, 7] })

      expect(await response.json()).toMatchObject({
        ok: false,
        error: { code: 'invalid-address' },
      })
    })
  })

  describe('POST /api/frames/place', () => {
    /** The `<code>` inside the caption, a static `<p>`. */
    const COMMAND = 7

    function place(body: unknown) {
      return editRoutes(
        board.root,
        {
          token: () => TOKEN,
          key: 'b'.repeat(64),
          cookieName: 'frameboard-key-111111111111',
          isOwnOrigin: () => false,
        },
        history,
      ).request('/api/frames/place', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${TOKEN}`,
        },
        body: JSON.stringify(body),
      })
    }

    const commandAt = () => ({
      ref: HERO,
      hash: hash(),
      index: COMMAND,
      spot: { left: 12, top: 8 },
    })

    describe('several at once', () => {
      it('places every element as one step one undo puts back', async () => {
        const original = read()

        const response = await place({
          ref: HERO,
          hash: hash(),
          places: [
            { index: HEADLINE, spot: { left: 1, top: 2 } },
            { index: CAPTION, spot: { left: 3, top: 4 } },
          ],
        })

        expect(await response.json()).toMatchObject({
          ok: true,
          data: {
            index: CAPTION,
            placed: [{ index: HEADLINE }, { index: CAPTION }],
          },
        })
        expect(read()).toContain('left: 1px')
        expect(read()).toContain('left: 3px')
        expect(read().match(/position: absolute/g)).toHaveLength(2)
        expect(history.counts().undo).toBe(1)
        await history.undo()
        expect(read()).toBe(original)
      })

      it('undoes a child picked ahead of the static parent also placed', async () => {
        const original = read()

        const response = await place({
          ref: HERO,
          hash: hash(),
          places: [
            { index: COMMAND, spot: { left: 1, top: 2 } },
            { index: CAPTION, spot: { left: 3, top: 4 } },
          ],
        })

        expect(await response.json()).toMatchObject({
          ok: true,
          data: {
            index: CAPTION,
            placed: [{ index: COMMAND }, { index: CAPTION }],
          },
        })
        expect(read()).not.toContain('position: relative')
        await history.undo()
        expect(read()).toBe(original)
      })

      it('writes a static parent the siblings share once', async () => {
        writeFileSync(
          path(),
          read().replace(
            '</body>',
            '<div data-name="Box"><span>a</span><span>b</span></div>\n  </body>',
          ),
        )
        const original = read()
        const spans = parseFrame(original).elements.flatMap((element, index) =>
          element.tagName === 'span' ? [index] : [],
        )

        await place({
          ref: HERO,
          hash: hash(),
          places: spans.map((index) => ({
            index,
            spot: { left: 1, top: 2 },
          })),
        })

        expect(read().match(/position: relative/g)).toHaveLength(1)
        expect(read().match(/position: absolute/g)).toHaveLength(2)
        await history.undo()
        expect(read()).toBe(original)
      })

      it('refuses whole on one bad index, writing nothing', async () => {
        const original = read()

        const response = await place({
          ref: HERO,
          hash: hash(),
          places: [
            { index: HEADLINE, spot: { left: 1, top: 2 } },
            { index: 999, spot: { left: 3, top: 4 } },
          ],
        })

        expect(response.status).toBe(409)
        expect(read()).toBe(original)
        expect(history.counts().undo).toBe(0)
      })
    })

    it('writes the static parent and the element, answering the hash written', async () => {
      const original = read()

      const response = await place(commandAt())

      expect(await response.json()).toEqual({
        ok: true,
        data: { ref: HERO, index: COMMAND, hash: hash(), sized: [] },
      })
      expect(read()).toBe(
        original
          .replace(
            '<p data-name="Caption">',
            '<p data-name="Caption" style="position: relative">',
          )
          .replace(
            'style="font-family: var(--font-mono)"',
            'style="font-family: var(--font-mono); position: absolute; left: 12px; top: 8px"',
          ),
      )
    })

    it('records both tags as one step, which one undo puts back', async () => {
      const original = read()
      await place(commandAt())

      expect(history.counts().undo).toBe(1)
      await history.undo()

      expect(read()).toBe(original)
    })

    it('refuses the whole undo once an agent changed the parent, keeping both tags', async () => {
      await place(commandAt())
      writeFileSync(
        path(),
        read().replace('data-name="Caption"', 'data-name="Note"'),
      )
      const agent = read()

      await expect(history.undo()).rejects.toMatchObject({
        code: 'undo-overtaken',
      })

      expect(read()).toBe(agent)
    })

    it('puts the element back in the flow as its own step', async () => {
      await place(commandAt())
      const placed = read()

      await place({ ...commandAt(), spot: null })

      expect(read()).toBe(
        placed.replace('; position: absolute; left: 12px; top: 8px', ''),
      )
      expect(history.counts().undo).toBe(2)
    })

    it('answers the sizes a placement wrote, and drops them back in flow', async () => {
      const original = read()
      // The Caption holds an element, so a placement sizes it, where text alone it would not.
      const response = await place({
        ...commandAt(),
        index: CAPTION,
        spot: { left: 12, top: 8, width: 120 },
      })
      const answered = (await response.json()) as { data: { sized: string[] } }

      await place({
        ...commandAt(),
        index: CAPTION,
        spot: null,
        drop: answered.data.sized,
      })

      expect([answered.data.sized, read()]).toEqual([['width'], original])
    })

    it('refuses stale-address on the old hash, writing nothing', async () => {
      const sent = commandAt()
      agentWrites(read().replace('hero</h1>', 'Agent</h1>'))
      const agent = read()

      const response = await place(sent)

      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({
        ok: false,
        error: { code: 'stale-address' },
      })
      expect(read()).toBe(agent)
      expect(history.counts().undo).toBe(0)
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

      const response = await place(commandAt())

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

    describe('several at once', () => {
      /** A deleted element goes back without the whitespace around it, as one alone does. */
      const unspaced = (html: string) => html.replace(/\s+/g, '')
      /** Look-alike siblings, whose bytes no anchor tells apart. */
      const LIST =
        '<ul data-name="List"><li class="row">one</li><li class="row">two</li><li class="row">three</li></ul>'

      it('takes out every element as one step one undo puts back', async () => {
        const original = read()

        const response = await remove({
          ref: HERO,
          indexes: [HEADLINE, CAPTION],
          hash: hash(),
        })

        expect(response.status).toBe(200)
        expect(read()).not.toContain('Headline')
        expect(read()).not.toContain('Caption')
        expect(history.counts().undo).toBe(1)
        await history.undo()
        expect(unspaced(read())).toBe(unspaced(original))
        await history.redo()
        expect(read()).not.toContain('Headline')
      })

      it('puts back look-alike siblings in their order', async () => {
        writeFileSync(path(), read().replace('</body>', `${LIST}\n  </body>`))
        const original = read()
        const rows = parseFrame(original).elements.flatMap((element, index) =>
          element.tagName === 'li' ? [index] : [],
        )

        await remove({
          ref: HERO,
          indexes: [rows[0], rows[1]],
          hash: hash(),
        })
        await history.undo()

        expect(unspaced(read())).toBe(unspaced(original))
      })

      it('takes one held inside another named with that one', async () => {
        const original = read()

        await remove({
          ref: HERO,
          indexes: [CAPTION, CAPTION + 1],
          hash: hash(),
        })

        expect(read()).not.toContain('Caption')
        expect(read()).not.toContain('Command')
        await history.undo()
        expect(unspaced(read())).toBe(unspaced(original))
      })

      it('refuses whole on one bad index, writing nothing', async () => {
        const original = read()

        const response = await remove({
          ref: HERO,
          indexes: [HEADLINE, 999],
          hash: hash(),
        })

        expect(response.status).toBe(409)
        expect(read()).toBe(original)
        expect(history.counts().undo).toBe(0)
      })
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

  describe('POST /api/frames/recolor', () => {
    /** The hero with its headline and caption set in raw indigo, one of them in rgb(). */
    const RAW =
      '<!doctype html><html><head></head><body><h1 style="color: #4F46E5">a</h1><p style="border: 1px solid rgb(79, 70, 229)">b</p></body></html>'
    const SWAPPED =
      '<!doctype html><html><head></head><body><h1 style="color: var(--primary)">a</h1><p style="border: 1px solid var(--primary)">b</p></body></html>'

    beforeEach(() => {
      writeFileSync(path(), RAW)
    })

    function recolor(body: unknown) {
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
      ).request('/api/frames/recolor', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${TOKEN}`,
        },
        body: JSON.stringify(body),
      })
    }

    const toPrimary = () => ({
      ref: HERO,
      hash: hash(),
      from: { value: '#4f46e5', percent: 100 },
      to: '--primary',
    })

    it('writes the token on every element using the color and answers how many', async () => {
      const response = await recolor(toPrimary())

      expect(await response.json()).toEqual({
        ok: true,
        data: { ref: HERO, hash: contentHash(SWAPPED), count: 2 },
      })
      expect(read()).toBe(SWAPPED)
    })

    it('records one step, which one undo reverts byte for byte', async () => {
      await recolor(toPrimary())

      expect(history.counts().undo).toBe(1)
      await history.undo()

      expect(read()).toBe(RAW)
    })

    it('answers zero and records nothing when no element states the color inline', async () => {
      const response = await recolor({
        ...toPrimary(),
        from: { value: '#0ea5e9', percent: 100 },
      })

      expect(await response.json()).toMatchObject({
        ok: true,
        data: { count: 0, hash: contentHash(RAW) },
      })
      expect(read()).toBe(RAW)
      expect(history.counts().undo).toBe(0)
    })

    it('refuses a token the project does not hold as unknown-token, writing nothing', async () => {
      const response = await recolor({ ...toPrimary(), to: '--brand' })

      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({
        ok: false,
        error: { code: 'unknown-token' },
      })
      expect(read()).toBe(RAW)
    })

    it('refuses a token that holds no color as unknown-token', async () => {
      const response = await recolor({ ...toPrimary(), to: '--space' })

      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({
        ok: false,
        error: { code: 'unknown-token' },
      })
    })

    it('refuses a token as the color to replace as usage', async () => {
      const response = await recolor({
        ...toPrimary(),
        from: { value: 'var(--accent)', percent: 100 },
      })

      expect(response.status).toBe(400)
    })

    it('refuses stale-address once the file moved, writing nothing', async () => {
      const sent = toPrimary()
      writeFileSync(path(), RAW.replace('>a<', '>Agent<'))
      const agent = read()

      const response = await recolor(sent)

      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({
        ok: false,
        error: { code: 'stale-address' },
      })
      expect(read()).toBe(agent)
      expect(history.counts().undo).toBe(0)
    })

    it('refuses a frame another session holds as frame-claimed', async () => {
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

      const response = await recolor(toPrimary())

      expect(response.status).toBe(409)
      expect(await response.json()).toMatchObject({
        ok: false,
        error: { code: 'frame-claimed' },
      })
      expect(read()).toBe(RAW)
    })
  })
})
