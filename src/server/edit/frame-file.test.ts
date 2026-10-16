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
import { editFrameFile } from './frame-file'

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
    expect(result).toEqual({ ok: true, hash: contentHash('<h1>New</h1>') })
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
