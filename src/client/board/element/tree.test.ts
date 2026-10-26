import { describe, expect, it } from 'vitest'

import type { ElementTree } from '@/shared/records/elements'

import { createTrees, fetchTree } from './tree'

const HERO = 'studio/home/hero'

function treeAt(hash: string): ElementTree {
  return { ref: HERO, hash: hash.repeat(64), elements: [] }
}

function deferred() {
  const loads: { ref: string; resolve: (tree: ElementTree) => void }[] = []
  const trees = createTrees(
    (ref) => new Promise((resolve) => loads.push({ ref, resolve })),
  )
  return { trees, loads }
}

describe('createTrees', () => {
  it('fetches a frame once per reload count', () => {
    const { trees, loads } = deferred()

    trees.request(HERO, 0)
    trees.request(HERO, 0)
    trees.request(HERO, 1)

    expect(loads).toHaveLength(2)
  })

  it('drops an answer for an older reload than the last asked for', async () => {
    const { trees, loads } = deferred()
    trees.request(HERO, 0)
    trees.request(HERO, 1)

    loads[1]?.resolve(treeAt('b'))
    loads[0]?.resolve(treeAt('a'))
    await Promise.resolve()

    expect(trees.store.getState().byRef[HERO]).toMatchObject({
      status: 'ready',
      tree: treeAt('b'),
    })
  })
})

describe('read', () => {
  it('resolves the tree once it arrives', async () => {
    const { trees, loads } = deferred()
    const read = trees.read(HERO, 0)

    loads[0]?.resolve(treeAt('a'))

    await expect(read).resolves.toEqual(treeAt('a'))
  })

  it('resolves null when the server refuses the tree', async () => {
    const trees = createTrees(async () => {
      throw new Error('builds a tbody')
    })

    await expect(trees.read(HERO, 0)).resolves.toBeNull()
  })
})

describe('catchUp', () => {
  it('fetches again when the tree it waited on predates the written bytes', async () => {
    const { trees, loads } = deferred()
    trees.request(HERO, 0)

    const caught = trees.catchUp(HERO, 'b'.repeat(64), 0)
    loads[0]?.resolve(treeAt('a'))
    await expect.poll(() => loads.length).toBe(2)
    loads[1]?.resolve(treeAt('b'))
    await caught

    expect(trees.store.getState().byRef[HERO]).toMatchObject({
      status: 'ready',
      tree: treeAt('b'),
    })
  })

  it('fetches nothing more when the held tree already shows the written bytes', async () => {
    const { trees, loads } = deferred()
    trees.request(HERO, 0)
    loads[0]?.resolve(treeAt('b'))

    await trees.catchUp(HERO, 'b'.repeat(64), 0)

    expect(loads).toHaveLength(1)
  })

  it('leaves a frame that reloaded since to the newer fetch', async () => {
    const { trees, loads } = deferred()
    trees.request(HERO, 0)

    const caught = trees.catchUp(HERO, 'b'.repeat(64), 0)
    trees.request(HERO, 1)
    loads[0]?.resolve(treeAt('a'))
    loads[1]?.resolve(treeAt('b'))
    await caught

    expect(loads).toHaveLength(2)
  })
})

describe('fetchTree', () => {
  it("throws the server's refusal message", async () => {
    const send: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          ok: false,
          error: { code: 'address-mismatch', message: 'builds a tbody' },
        }),
        { status: 422 },
      )

    await expect(fetchTree(HERO, send)).rejects.toThrow('builds a tbody')
  })
})
