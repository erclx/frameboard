import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { contentHash } from './address'
import { swapSpan } from './element-span'
import {
  editFrameFile,
  editFrameFileAll,
  extractFrameFile,
  insertFrameFile,
  moveFrameFile,
  removeFrameFile,
} from './frame-file'
import { removeInserted } from './insert'

// Lets a test land a write on the frame while the editor holds its temporary
// file, which is the window the reread before the rename guards.
const race = vi.hoisted(() => ({
  onWrite: undefined as ((path: string) => void) | undefined,
}))

vi.mock('node:fs', async (importOriginal) => {
  const fs = await importOriginal<typeof import('node:fs')>()
  return {
    ...fs,
    writeFileSync: (...args: Parameters<typeof fs.writeFileSync>) => {
      fs.writeFileSync(...args)
      if (typeof args[0] === 'string') race.onWrite?.(args[0])
    },
  }
})

let dir: string
let frame: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'frameboard-edit-'))
  frame = join(dir, 'hero.html')
})

afterEach(() => {
  race.onWrite = undefined
  rmSync(dir, { recursive: true, force: true })
})

describe('editFrameFile', () => {
  it('should write the edit and return the new hash', () => {
    writeFileSync(frame, '<h1>Old</h1>')

    const result = editFrameFile(
      frame,
      { index: 3 },
      { kind: 'text', value: 'New' },
    )

    expect(readFileSync(frame, 'utf8')).toBe('<h1>New</h1>')
    expect(result).toMatchObject({
      ok: true,
      hash: contentHash('<h1>New</h1>'),
    })
  })

  it('should write when the given hash matches the file', () => {
    writeFileSync(frame, '<h1>Old</h1>')

    const result = editFrameFile(
      frame,
      { index: 3, hash: contentHash('<h1>Old</h1>') },
      { kind: 'text', value: 'New' },
    )

    expect(result).toMatchObject({ ok: true })
    expect(readFileSync(frame, 'utf8')).toBe('<h1>New</h1>')
  })

  it('should refuse a hash the file no longer has and write nothing', () => {
    writeFileSync(frame, '<h1>Old</h1>')

    const result = editFrameFile(
      frame,
      { index: 3, hash: contentHash('<h1>Older</h1>') },
      { kind: 'text', value: 'New' },
    )

    expect(result).toMatchObject({ ok: false, reason: 'stale-address' })
    expect(readFileSync(frame, 'utf8')).toBe('<h1>Old</h1>')
  })

  describe('an edit made from a source the file has since left', () => {
    const WAS = '<h1>Old</h1><p style="color: red">x</p>'
    const sourceAt = (hash: string) => (hash === contentHash(WAS) ? WAS : null)

    it('should land past an agent write to a sibling, keeping both', () => {
      const agent = '<h1>Old</h1><p style="color: blue">x</p>'
      writeFileSync(frame, agent)

      const result = editFrameFile(
        frame,
        { index: 3, hash: contentHash(WAS) },
        { kind: 'text', value: 'New' },
        sourceAt,
      )

      expect(readFileSync(frame, 'utf8')).toBe(
        '<h1>New</h1><p style="color: blue">x</p>',
      )
      expect(result).toMatchObject({
        ok: true,
        index: 3,
        from: contentHash(agent),
      })
    })

    it('should land at the new index once an agent added an element above', () => {
      writeFileSync(frame, `<nav></nav>${WAS}`)

      const result = editFrameFile(
        frame,
        { index: 4, hash: contentHash(WAS) },
        { kind: 'style', property: 'color', value: 'green' },
        sourceAt,
      )

      expect(readFileSync(frame, 'utf8')).toBe(
        '<nav></nav><h1>Old</h1><p style="color: green">x</p>',
      )
      expect(result).toMatchObject({ ok: true, index: 5 })
    })

    it('should refuse once the agent changed the edited element', () => {
      writeFileSync(frame, '<h1>Agent</h1><p style="color: red">x</p>')

      const result = editFrameFile(
        frame,
        { index: 3, hash: contentHash(WAS) },
        { kind: 'text', value: 'New' },
        sourceAt,
      )

      expect(result).toMatchObject({
        ok: false,
        reason: 'stale-address',
        detail:
          'the agent changed this <h1> in hero.html while your edit waited, so nothing was written',
        moved: false,
      })
      expect(readFileSync(frame, 'utf8')).toBe(
        '<h1>Agent</h1><p style="color: red">x</p>',
      )
    })

    it('should say the index moved once the agent also added an element', () => {
      writeFileSync(
        frame,
        '<nav></nav><h1>Agent</h1><p style="color: red">x</p>',
      )

      const result = editFrameFile(
        frame,
        { index: 3, hash: contentHash(WAS) },
        { kind: 'text', value: 'New' },
        sourceAt,
      )

      expect(result).toMatchObject({
        ok: false,
        reason: 'stale-address',
        moved: true,
      })
    })

    it('should refuse when no source is kept under the hash', () => {
      writeFileSync(frame, '<h1>Old</h1><p>y</p>')

      const result = editFrameFile(
        frame,
        { index: 3, hash: contentHash('<h1>Older</h1>') },
        { kind: 'text', value: 'New' },
        sourceAt,
      )

      expect(result).toMatchObject({ ok: false, reason: 'stale-address' })
      expect(readFileSync(frame, 'utf8')).toBe('<h1>Old</h1><p>y</p>')
    })
  })

  it('should refuse a file holding invalid UTF-8 and leave its bytes', () => {
    const bytes = Buffer.concat([
      Buffer.from('<h1>a'),
      Buffer.from([0xff]),
      Buffer.from('</h1>'),
    ])
    writeFileSync(frame, bytes)

    const result = editFrameFile(
      frame,
      { index: 3 },
      { kind: 'text', value: 'b' },
    )

    expect(result).toMatchObject({ ok: false, reason: 'invalid-utf8' })
    expect(readFileSync(frame).equals(bytes)).toBe(true)
  })

  it('should keep a leading BOM', () => {
    writeFileSync(frame, '\uFEFF<h1>Old</h1>')

    editFrameFile(frame, { index: 3 }, { kind: 'text', value: 'New' })

    expect(readFileSync(frame, 'utf8')).toBe('\uFEFF<h1>New</h1>')
  })

  it('should pass a refusal from the writer through and write nothing', () => {
    writeFileSync(frame, '<script>a</script>')

    const result = editFrameFile(
      frame,
      { index: 2 },
      { kind: 'text', value: 'b' },
    )

    expect(result).toMatchObject({ ok: false, reason: 'not-text-only' })
    expect(readFileSync(frame, 'utf8')).toBe('<script>a</script>')
  })

  it('should refuse a write landing before the rename and keep the newer bytes', () => {
    writeFileSync(frame, '<h1>Old</h1>')
    race.onWrite = (path) => {
      if (path !== frame) writeFileSync(frame, '<h1>Agent</h1>')
    }

    const result = editFrameFile(
      frame,
      { index: 3 },
      { kind: 'text', value: 'New' },
    )

    expect(result).toMatchObject({ ok: false, reason: 'stale-address' })
    expect(readFileSync(frame, 'utf8')).toBe('<h1>Agent</h1>')
  })

  it('should leave no temporary file behind', () => {
    writeFileSync(frame, '<h1>Old</h1>')
    race.onWrite = (path) => {
      if (path !== frame) writeFileSync(frame, '<h1>Agent</h1>')
    }

    editFrameFile(frame, { index: 3 }, { kind: 'text', value: 'New' })

    expect(readdirSync(dir)).toEqual(['hero.html'])
  })
})

describe('editFrameFileAll', () => {
  const OLD = '<p>Old</p>'

  it('should write a text and a style change on one element as one write', () => {
    writeFileSync(frame, OLD)

    const result = editFrameFileAll(frame, contentHash(OLD), [
      { index: 3, change: { kind: 'text', value: 'One\nTwo' } },
      {
        index: 3,
        change: { kind: 'style', property: 'white-space', value: 'pre-line' },
      },
    ])

    expect(result).toMatchObject({ ok: true, indexes: [3, 3] })
    expect(readFileSync(frame, 'utf8')).toBe(
      '<p style="white-space: pre-line">One\nTwo</p>',
    )
  })

  it('should answer the pair as one span that swaps back to the old bytes', () => {
    writeFileSync(frame, OLD)
    const result = editFrameFileAll(frame, contentHash(OLD), [
      { index: 3, change: { kind: 'text', value: 'One\nTwo' } },
      {
        index: 3,
        change: { kind: 'style', property: 'white-space', value: 'pre-line' },
      },
    ])
    if (!result.ok) throw new Error(result.reason)
    const [span] = result.spans

    expect(result.spans).toHaveLength(1)
    expect(
      span && swapSpan(readFileSync(frame, 'utf8'), span, 'after')?.html,
    ).toBe(OLD)
  })

  describe('with two attributes on one element', () => {
    const VIEWER = '<model-viewer src="a.glb"></model-viewer>'
    const orbit = (value: string) => ({
      index: 3,
      change: { kind: 'attribute', name: 'camera-orbit', value } as const,
    })
    const reach = {
      index: 3,
      change: {
        kind: 'attribute',
        name: 'max-camera-orbit',
        value: 'auto auto 4m',
      } as const,
    }

    it('should write both as one write', () => {
      writeFileSync(frame, VIEWER)

      const result = editFrameFileAll(frame, contentHash(VIEWER), [
        orbit('40deg 75deg 4m'),
        reach,
      ])

      expect(result).toMatchObject({ ok: true, indexes: [3, 3] })
      expect(readFileSync(frame, 'utf8')).toBe(
        '<model-viewer src="a.glb" camera-orbit="40deg 75deg 4m" max-camera-orbit="auto auto 4m"></model-viewer>',
      )
    })

    it('should answer the pair as one span that swaps back to the old bytes', () => {
      writeFileSync(frame, VIEWER)
      const result = editFrameFileAll(frame, contentHash(VIEWER), [
        orbit('40deg 75deg 4m'),
        reach,
      ])
      if (!result.ok) throw new Error(result.reason)
      const [span] = result.spans

      expect(result.spans).toHaveLength(1)
      expect(
        span && swapSpan(readFileSync(frame, 'utf8'), span, 'after')?.html,
      ).toBe(VIEWER)
    })

    it('should refuse one attribute named twice and write nothing', () => {
      writeFileSync(frame, VIEWER)

      const result = editFrameFileAll(frame, contentHash(VIEWER), [
        orbit('40deg 75deg 4m'),
        orbit('0deg 75deg 4m'),
      ])

      expect(result).toMatchObject({ ok: false, reason: 'invalid-edit' })
      expect(readFileSync(frame, 'utf8')).toBe(VIEWER)
    })
  })

  it('should refuse two style changes on one element and write nothing', () => {
    writeFileSync(frame, OLD)

    const result = editFrameFileAll(frame, contentHash(OLD), [
      {
        index: 3,
        change: { kind: 'style', property: 'opacity', value: '0.5' },
      },
      { index: 3, change: { kind: 'style', property: 'color', value: 'red' } },
    ])

    expect(result).toMatchObject({ ok: false, reason: 'invalid-edit' })
    expect(readFileSync(frame, 'utf8')).toBe(OLD)
  })

  it('should refuse two text changes on one element and write nothing', () => {
    writeFileSync(frame, OLD)

    const result = editFrameFileAll(frame, contentHash(OLD), [
      { index: 3, change: { kind: 'text', value: 'One' } },
      { index: 3, change: { kind: 'text', value: 'Two' } },
    ])

    expect(result).toMatchObject({ ok: false, reason: 'invalid-edit' })
    expect(readFileSync(frame, 'utf8')).toBe(OLD)
  })
})

describe('insertFrameFile', () => {
  const TEXT = '<p data-name="Text">Text</p>'

  it('should write the element and answer its index and the new hash', () => {
    writeFileSync(frame, '<main></main>')

    const result = insertFrameFile(
      frame,
      contentHash('<main></main>'),
      { parent: 3, before: null },
      TEXT,
    )

    expect(readFileSync(frame, 'utf8')).toBe(`<main>${TEXT}</main>`)
    expect(result).toMatchObject({
      ok: true,
      index: 4,
      hash: contentHash(`<main>${TEXT}</main>`),
    })
  })

  describe('with a model', () => {
    const MODEL =
      '<model-viewer data-name="a.glb" src="../assets/a.glb"></model-viewer>'
    const SCRIPT =
      '<script type="module" src="../assets/model-viewer.min.js"></script>'
    const BARE =
      '<html><head><title>Hero</title></head><body><main><p>Hi</p></main></body></html>'

    it("should write the viewer's script into the head and the model into the gap the sent bytes named", () => {
      writeFileSync(frame, BARE)

      const result = insertFrameFile(
        frame,
        contentHash(BARE),
        { parent: 4, before: 5 },
        MODEL,
        undefined,
        true,
      )

      expect(readFileSync(frame, 'utf8')).toBe(
        `<html><head><title>Hero</title>${SCRIPT}</head><body><main>${MODEL}<p>Hi</p></main></body></html>`,
      )
      expect(result).toMatchObject({ ok: true, index: 6 })
    })

    it('should carry a selection past both the script and the model', () => {
      writeFileSync(frame, BARE)

      const result = insertFrameFile(
        frame,
        contentHash(BARE),
        { parent: 4, before: 5 },
        MODEL,
        undefined,
        true,
      )

      const remap = result.ok ? result.remap : () => null
      expect([2, 4, 5].map(remap)).toEqual([2, 5, 7])
    })

    it('should add no second script for a second model', () => {
      const first = `<html><head>${SCRIPT}</head><body><main>${MODEL}</main></body></html>`
      writeFileSync(frame, first)

      insertFrameFile(
        frame,
        contentHash(first),
        { parent: 4, before: null },
        MODEL,
        undefined,
        true,
      )

      expect(readFileSync(frame, 'utf8')).toBe(
        `<html><head>${SCRIPT}</head><body><main>${MODEL}${MODEL}</main></body></html>`,
      )
    })

    it('should answer a span whose undo takes the model out and leaves the script', () => {
      writeFileSync(frame, BARE)
      const result = insertFrameFile(
        frame,
        contentHash(BARE),
        { parent: 4, before: 5 },
        MODEL,
        undefined,
        true,
      )

      const undone = result.ok
        ? removeInserted(readFileSync(frame, 'utf8'), result.span)
        : undefined

      expect(undone?.html).toBe(
        `<html><head><title>Hero</title>${SCRIPT}</head><body><main><p>Hi</p></main></body></html>`,
      )
    })
  })

  it('should refuse a hash the file no longer has, so a retried insert lands once', () => {
    writeFileSync(frame, '<main></main>')
    const sent = contentHash('<main></main>')
    insertFrameFile(frame, sent, { parent: 3, before: null }, TEXT)

    const retried = insertFrameFile(
      frame,
      sent,
      { parent: 3, before: null },
      TEXT,
    )

    expect(retried).toMatchObject({ ok: false, reason: 'stale-address' })
    expect(readFileSync(frame, 'utf8')).toBe(`<main>${TEXT}</main>`)
  })

  it('should refuse a write landing before the rename and keep the newer bytes', () => {
    writeFileSync(frame, '<main></main>')
    race.onWrite = (path) => {
      if (path !== frame) writeFileSync(frame, '<main>Agent</main>')
    }

    const result = insertFrameFile(
      frame,
      contentHash('<main></main>'),
      { parent: 3, before: null },
      TEXT,
    )

    expect(result).toMatchObject({ ok: false, reason: 'stale-address' })
    expect(readFileSync(frame, 'utf8')).toBe('<main>Agent</main>')
    expect(readdirSync(dir)).toEqual(['hero.html'])
  })
})

describe('extractFrameFile', () => {
  const SOURCE =
    '<!doctype html><html><head></head><body><h1>Hi</h1><p>Text</p></body></html>'
  const PARAGRAPH = 4

  const own = () => join(dir, 'p.html')
  const extract = (created: () => Promise<void> = async () => {}) =>
    extractFrameFile(
      frame,
      contentHash(SOURCE),
      PARAGRAPH,
      (element) => ({ ok: true, path: own(), html: element.frame }),
      created,
    )

  beforeEach(() => {
    writeFileSync(frame, SOURCE)
  })

  it('should write the new frame and take the element out of the source', async () => {
    const result = await extract()

    expect(result).toMatchObject({
      ok: true,
      hash: contentHash(readFileSync(frame)),
    })
    expect(readFileSync(frame, 'utf8')).toBe(SOURCE.replace('<p>Text</p>', ''))
    expect(readFileSync(own(), 'utf8')).toContain('<body><p>Text</p></body>')
  })

  it('should leave neither file changed when the source moved before its write', async () => {
    const agent = SOURCE.replace('Hi', 'Agent')
    race.onWrite = (path) => {
      if (path !== own()) return
      race.onWrite = undefined
      writeFileSync(frame, agent)
    }

    const result = await extract()

    expect(result).toMatchObject({ ok: false, reason: 'stale-address' })
    expect(readdirSync(dir)).toEqual(['hero.html'])
    expect(readFileSync(frame, 'utf8')).toBe(agent)
  })

  it('should take the new frame back out when its record fails', async () => {
    const extracting = extract(async () => {
      throw new Error('disk full')
    })

    await expect(extracting).rejects.toThrow('disk full')
    expect(readdirSync(dir)).toEqual(['hero.html'])
    expect(readFileSync(frame, 'utf8')).toBe(SOURCE)
  })

  it('should leave the source whole when the new file is already there', async () => {
    writeFileSync(own(), 'agent')

    await expect(extract()).rejects.toThrow('EEXIST')

    expect(readFileSync(frame, 'utf8')).toBe(SOURCE)
    expect(readFileSync(own(), 'utf8')).toBe('agent')
  })

  it('should refuse a hash the file no longer has, writing nothing', async () => {
    writeFileSync(frame, SOURCE.replace('Hi', 'Agent'))

    const result = await extract()

    expect(result).toMatchObject({ ok: false, reason: 'stale-address' })
    expect(readdirSync(dir)).toEqual(['hero.html'])
  })
})

describe('the remap a write answers', () => {
  // main 3, h1 4, div 5, span 6, p 7
  const SOURCE = '<main><h1>A</h1><div><span>x</span></div><p>B</p></main>'
  const hash = contentHash(SOURCE)

  beforeEach(() => {
    writeFileSync(frame, SOURCE)
  })

  it('should keep every index through an edit', () => {
    const result = editFrameFile(
      frame,
      { index: 4, hash },
      { kind: 'style', property: 'color', value: 'red' },
    )

    if (!result.ok) throw new Error(result.detail)
    expect([3, 4, 5, 6, 7].map(result.remap)).toEqual([3, 4, 5, 6, 7])
  })

  it('should push every element after an insert on by one', () => {
    const result = insertFrameFile(
      frame,
      hash,
      { parent: 3, before: 4 },
      '<p data-name="Text">Text</p>',
    )

    if (!result.ok) throw new Error(result.detail)
    expect([3, 4, 5, 6, 7].map(result.remap)).toEqual([3, 5, 6, 7, 8])
  })

  it('should map a removed element and its descendants to nothing', () => {
    const result = removeFrameFile(frame, hash, 5)

    if (!result.ok) throw new Error(result.detail)
    expect([3, 4, 5, 6, 7].map(result.remap)).toEqual([3, 4, null, null, 5])
  })

  it('should carry a moved element with its descendants to the new gap', () => {
    const result = moveFrameFile(frame, hash, 5, { parent: 3, before: 4 })

    if (!result.ok) throw new Error(result.detail)
    expect([3, 4, 5, 6, 7].map(result.remap)).toEqual([3, 6, 4, 5, 7])
  })

  it('should pull the elements a moved element passes back by its size', () => {
    const result = moveFrameFile(frame, hash, 4, { parent: 3, before: null })

    if (!result.ok) throw new Error(result.detail)
    expect([3, 4, 5, 6, 7].map(result.remap)).toEqual([3, 7, 4, 5, 6])
  })
})
