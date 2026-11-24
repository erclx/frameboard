import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  copyFixtureBoard,
  type FixtureBoard,
} from '../../../test/support/fixture-board'
import { skeleton } from '../board/frames'
import { claim, reserve } from '../claims/store'
import { contentHash, parseFrame } from '../edit/address'
import { History } from '../history/stack'
import { resolveAnchors } from '../notes/anchor'
import { readNotes } from '../notes/store'
import { editRoutes } from './edit'

const TOKEN = 'a'.repeat(64)
const HERO = 'webapp/home/hero'
/** The `<h1>` in the fixture's hero, by `querySelectorAll('*')` order. */
const HEADLINE = 5

describe('POST /api/frames/extract', () => {
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

  const BOX = { x: 1600, y: 40, width: 320, height: 48 }

  function extract(body: unknown) {
    return editRoutes(
      board.root,
      {
        token: () => TOKEN,
        key: 'b'.repeat(64),
        cookieName: 'frameboard-key-111111111111',
        isOwnOrigin: () => false,
      },
      history,
    ).request('/api/frames/extract', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${TOKEN}`,
      },
      body: JSON.stringify(body),
    })
  }

  const headline = () => ({
    ref: HERO,
    hash: hash(),
    index: HEADLINE,
    box: BOX,
  })
  const pageFile = (name: string) => join(board.root, 'webapp', 'home', name)
  const readPage = (name: string) => readFileSync(pageFile(name), 'utf8')
  const frames = () =>
    readdirSync(pageFile('')).filter((name) => name.endsWith('.html'))
  const layout = () => JSON.parse(readPage('layout.json')).frames

  it('moves the element into a frame of its own and answers both', async () => {
    const original = read()

    const response = await extract(headline())

    expect(await response.json()).toEqual({
      ok: true,
      data: { ref: HERO, hash: hash(), frame: 'webapp/home/headline' },
    })
    expect(read()).toBe(
      original.replace('<h1 data-name="Headline">hero</h1>', ''),
    )
    expect(readPage('headline.html')).toBe(
      original.replace(
        /\s*<h1[\s\S]*$/,
        '<h1 data-name="Headline">hero</h1></body>\n</html>\n',
      ),
    )
  })

  it('places the new frame hugging at the box, over the other frames', async () => {
    await extract(headline())

    expect(layout().headline).toEqual({
      ...BOX,
      order: 2,
      hidden: false,
      locked: false,
      hugWidth: true,
      hugHeight: true,
    })
  })

  it('keeps the kit the source frame draws with', async () => {
    const held = JSON.parse(readPage('layout.json'))
    held.frames.hero.kit = 'paper'
    writeFileSync(pageFile('layout.json'), JSON.stringify(held))

    await extract(headline())

    expect(layout().headline).toMatchObject({ kit: 'paper' })
  })

  it('records one step, which undo reverts across both files byte for byte', async () => {
    const original = read()
    const placed = layout()
    await extract(headline())

    expect(history.counts().undo).toBe(1)
    await history.undo()

    expect(read()).toBe(original)
    expect(frames()).toEqual(['about.html', 'hero.html'])
    expect(layout()).toEqual(placed)
  })

  it('moves the element again on a redo, byte for byte', async () => {
    await extract(headline())
    const source = read()
    const own = readPage('headline.html')
    const placed = layout()
    await history.undo()

    await history.redo()

    expect(read()).toBe(source)
    expect(readPage('headline.html')).toBe(own)
    expect(layout()).toEqual(placed)
  })

  it('keeps both files when an agent edited the new frame before the undo', async () => {
    await extract(headline())
    const source = read()
    writeFileSync(pageFile('headline.html'), 'agent')

    await expect(history.undo()).rejects.toMatchObject({
      code: 'undo-overtaken',
    })

    expect(read()).toBe(source)
    expect(readPage('headline.html')).toBe('agent')
  })

  it('refuses stale-address once the file moved, writing neither file', async () => {
    const sent = headline()
    writeFileSync(path(), read().replace('hero</h1>', 'Agent</h1>'))
    const agent = read()
    const placed = layout()

    const response = await extract(sent)

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: 'stale-address', details: { ref: HERO } },
    })
    expect(read()).toBe(agent)
    expect(frames()).toEqual(['about.html', 'hero.html'])
    expect(layout()).toEqual(placed)
    expect(history.counts().undo).toBe(0)
  })

  it('refuses a frame another session holds as frame-claimed, writing neither file', async () => {
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

    const response = await extract(headline())

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: 'frame-claimed' },
    })
    expect(read()).toBe(original)
    expect(frames()).toEqual(['about.html', 'hero.html'])
  })

  it('takes the next free name when the page already holds one', async () => {
    writeFileSync(pageFile('headline.html'), skeleton('headline'))

    const response = await extract(headline())

    expect(await response.json()).toMatchObject({
      data: { frame: 'webapp/home/headline-2' },
    })
  })

  it('leaves a name an agent reserved for its own frame', async () => {
    await reserve(
      board.root,
      { session: 'sess-a', agent: 'claude', tag: 'claude · webapp' },
      [
        {
          frame: 'webapp/home/headline',
          box: { x: 0, y: 0, width: 10, height: 10 },
        },
      ],
      new Date(),
    )

    const response = await extract(headline())

    expect(await response.json()).toMatchObject({
      data: { frame: 'webapp/home/headline-2' },
    })
  })

  it('names the frame by its tag when the element has no name', async () => {
    writeFileSync(path(), read().replace(' data-name="Headline"', ''))

    const response = await extract(headline())

    expect(await response.json()).toMatchObject({
      data: { frame: 'webapp/home/h1' },
    })
  })

  it('stands an element a rule placed in the flow of its new frame alone', async () => {
    writeFileSync(
      path(),
      read().replace(
        '</title>',
        '</title><style>h1 { position: absolute; left: 50%; transform: translateX(-50%) }</style>',
      ),
    )

    // The new `<style>` pushed the headline on by one.
    await extract({ ...headline(), index: HEADLINE + 1 })

    expect(readPage('headline.html')).toContain(
      '<h1 data-name="Headline" style="position: relative; inset: auto; transform: none">hero</h1>',
    )
  })

  it('leaves a note pinned on the element to its source frame alone', async () => {
    const page = pageFile('')
    const notes = pageFile('notes.json')
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
            anchor: { index: HEADLINE, hash: hash() },
          },
        ],
      }),
    )

    await extract(headline())

    const { notes: kept } = await readNotes(notes)
    expect(kept[0]?.frame).toBe('hero')
    await expect(resolveAnchors(page, kept)).resolves.toEqual({
      [pinned.id]: null,
    })
  })

  it('refuses an element that cannot stand alone, writing neither file', async () => {
    writeFileSync(
      path(),
      read().replace(
        '</body>',
        '<table><tbody><tr><td>x</td></tr></tbody></table></body>',
      ),
    )
    const original = read()
    const row = parseFrame(original).elements.findIndex(
      ({ tagName }) => tagName === 'tr',
    )

    const response = await extract({ ...headline(), index: row })

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({
      error: { code: 'invalid-container' },
    })
    expect(read()).toBe(original)
    expect(frames()).toEqual(['about.html', 'hero.html'])
  })
})
