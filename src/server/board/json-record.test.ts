import { spawnSync } from 'node:child_process'
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { FrameboardError } from '@/shared/errors'
import { type LayoutFile, layoutFileSchema } from '@/shared/records/board'

import {
  readRecord,
  type RecordSpec,
  updateRecord,
  withLocks,
} from './json-record'

// Lets a test hold one writer between two steps of its lock handling, which
// is the only way to order two writers breaking one lock.
const race = vi.hoisted(() => ({
  onLockStat: [] as (() => Promise<void>)[],
  onLink: undefined as (() => Promise<void>) | undefined,
}))

vi.mock('node:fs/promises', async (importOriginal) => {
  const fs = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...fs,
    stat: async (...args: Parameters<typeof fs.stat>) => {
      if (String(args[0]).endsWith('layout.json.lock'))
        await race.onLockStat.shift()?.()
      return fs.stat(...args)
    },
    link: async (...args: Parameters<typeof fs.link>) => {
      await race.onLink?.()
      return fs.link(...args)
    },
  }
})

const layoutSpec: RecordSpec<LayoutFile> = {
  schema: layoutFileSchema,
  invalidCode: 'layout-invalid',
  empty: () => ({ version: 1, frames: {} }),
}

function box(x: number) {
  return { x, y: 0, width: 10, height: 10, order: 0 }
}

describe('json-record', () => {
  let dir: string
  let path: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'frameboard-record-'))
    path = join(dir, 'layout.json')
  })

  afterEach(() => {
    race.onLockStat = []
    race.onLink = undefined
    rmSync(dir, { recursive: true, force: true })
  })

  describe('readRecord', () => {
    it('reads a missing file as the empty record', async () => {
      expect(await readRecord(path, layoutSpec)).toEqual({
        version: 1,
        frames: {},
      })
    })

    it.each([
      ['does not parse', '{'],
      ['carries another version', '{ "version": 2, "frames": {} }'],
    ])('throws the spec code on a file that %s', async (_label, text) => {
      writeFileSync(path, text)

      await expect(readRecord(path, layoutSpec)).rejects.toMatchObject({
        code: 'layout-invalid',
        details: { path },
      })
    })
  })

  describe('updateRecord', () => {
    it('writes two-space JSON with a trailing newline', async () => {
      await updateRecord(path, layoutSpec, (layout) => ({
        ...layout,
        frames: { hero: box(0) },
      }))

      expect(readFileSync(path, 'utf8')).toBe(
        '{\n  "version": 1,\n  "frames": {\n    "hero": {\n      "x": 0,\n      "y": 0,\n      "width": 10,\n      "height": 10,\n      "order": 0\n    }\n  }\n}\n',
      )
    })

    it('keeps unknown keys and key order through a write', async () => {
      writeFileSync(
        path,
        '{"frames":{"hero":{"order":0,"x":0,"y":0,"width":10,"height":10,"tint":"red"}},"version":1,"grid":8}',
      )

      await updateRecord(path, layoutSpec, (layout) => layout)

      expect(Object.keys(JSON.parse(readFileSync(path, 'utf8')))).toEqual([
        'frames',
        'version',
        'grid',
      ])
      expect(readFileSync(path, 'utf8')).toContain('"tint": "red"')
    })

    it('leaves an invalid file byte-identical', async () => {
      writeFileSync(path, '{')

      await expect(
        updateRecord(path, layoutSpec, (layout) => layout),
      ).rejects.toBeInstanceOf(FrameboardError)
      expect(readFileSync(path, 'utf8')).toBe('{')
    })

    it('lands both of two racing writers and leaves no lock or temp file', async () => {
      await Promise.all(
        ['hero', 'about'].map((name, index) =>
          updateRecord(path, layoutSpec, (layout) => ({
            ...layout,
            frames: { ...layout.frames, [name]: box(index) },
          })),
        ),
      )

      expect(
        Object.keys(JSON.parse(readFileSync(path, 'utf8')).frames).sort(),
      ).toEqual(['about', 'hero'])
      expect(readdirSync(dir)).toEqual(['layout.json'])
    })

    it('breaks a lock held by a dead pid', async () => {
      const deadPid = spawnSync('true').pid
      writeFileSync(`${path}.lock`, JSON.stringify({ pid: deadPid }))

      await updateRecord(path, layoutSpec, (layout) => layout, {
        timeoutMs: 200,
      })

      expect(readdirSync(dir)).toEqual(['layout.json'])
    })

    it('lands both of two writers breaking one dead lock at once', async () => {
      const deadPid = spawnSync('true').pid
      writeFileSync(`${path}.lock`, JSON.stringify({ pid: deadPid }))

      await Promise.all(
        ['hero', 'about'].map((name, index) =>
          updateRecord(path, layoutSpec, (layout) => ({
            ...layout,
            frames: { ...layout.frames, [name]: box(index) },
          })),
        ),
      )

      expect(
        Object.keys(JSON.parse(readFileSync(path, 'utf8')).frames).sort(),
      ).toEqual(['about', 'hero'])
      expect(readdirSync(dir)).toEqual(['layout.json'])
    })

    it('lands a writer that judged a dead lock stale after another broke and released it', async () => {
      const deadPid = spawnSync('true').pid
      writeFileSync(`${path}.lock`, JSON.stringify({ pid: deadPid }))
      let reachedStat = () => {}
      const atStat = new Promise<void>((resolve) => {
        reachedStat = resolve
      })
      let resumeLate = () => {}
      const lateHeld = new Promise<void>((resolve) => {
        resumeLate = resolve
      })
      race.onLockStat.push(() => {
        reachedStat()
        return lateHeld
      })
      // The late writer has read the dead lock and waits to judge it.
      const late = withLocks([path], async () => {}, { timeoutMs: 500 })
      await atStat

      let holding = () => {}
      const held = new Promise<void>((resolve) => {
        holding = resolve
      })
      let finish = () => {}
      const finished = new Promise<void>((resolve) => {
        finish = resolve
      })
      // The first writer breaks the dead lock and takes its own in its place.
      const first = withLocks([path], async () => {
        holding()
        await finished
      })
      await held
      // The first writer releases while the late one handles the lock it
      // judged, whether that is putting a lock back or waiting on it.
      const release = async () => {
        finish()
        await first
      }
      race.onLink = release
      race.onLockStat.push(release)
      resumeLate()

      await late
      expect(readdirSync(dir)).toEqual([])
    })

    it('breaks a dead lock past a break guard older than 10 s', async () => {
      const deadPid = spawnSync('true').pid
      writeFileSync(`${path}.lock`, JSON.stringify({ pid: deadPid }))
      writeFileSync(`${path}.break.lock`, '')
      const old = new Date(Date.now() - 11_000)
      utimesSync(`${path}.break.lock`, old, old)

      await updateRecord(path, layoutSpec, (layout) => layout, {
        timeoutMs: 200,
      })

      expect(readdirSync(dir)).toEqual(['layout.json'])
    })

    it('waits out a dead lock while a fresh break guard is held', async () => {
      const deadPid = spawnSync('true').pid
      writeFileSync(`${path}.lock`, JSON.stringify({ pid: deadPid }))
      writeFileSync(`${path}.break.lock`, '')

      await expect(
        updateRecord(path, layoutSpec, (layout) => layout, { timeoutMs: 100 }),
      ).rejects.toMatchObject({ code: 'lock-timeout' })
    })

    it('leaves a lock another writer took in its place on release', async () => {
      const theirs = JSON.stringify({ pid: process.pid, nonce: 'theirs' })

      await updateRecord(path, layoutSpec, (layout) => {
        writeFileSync(`${path}.lock`, theirs)
        return layout
      })

      expect(readFileSync(`${path}.lock`, 'utf8')).toBe(theirs)
    })

    it('breaks a lock older than 10 s whatever its pid', async () => {
      writeFileSync(`${path}.lock`, JSON.stringify({ pid: process.pid }))
      const old = new Date(Date.now() - 11_000)
      utimesSync(`${path}.lock`, old, old)

      await updateRecord(path, layoutSpec, (layout) => layout, {
        timeoutMs: 200,
      })

      expect(readdirSync(dir)).toEqual(['layout.json'])
    })

    it('times out on a live holder and writes nothing', async () => {
      writeFileSync(`${path}.lock`, JSON.stringify({ pid: process.pid }))

      await expect(
        updateRecord(path, layoutSpec, (layout) => layout, { timeoutMs: 100 }),
      ).rejects.toMatchObject({ code: 'lock-timeout', exitCode: 6 })
      expect(readdirSync(dir)).toEqual(['layout.json.lock'])
    })
  })
})
