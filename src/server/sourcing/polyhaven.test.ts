import { describe, expect, it } from 'vitest'

import { version } from '@/shared/version'

import { DL, polyhaven, rawModel } from '../../../test/support/polyhaven'
import { fetchModel, modelById, searchModels } from './polyhaven'

describe('searchModels', () => {
  it('asks for the model list once, naming Frameboard in the user agent', async () => {
    const { send, asked } = polyhaven({ stool: rawModel() })

    await searchModels('stool', send)

    expect(asked).toHaveLength(1)
    expect(asked[0]?.url.href).toBe('https://api.polyhaven.com/assets?t=models')
    expect(asked[0]?.userAgent).toBe(`frameboard/${version}`)
  })

  it('maps a model to the record, its sizes up to its largest texture', async () => {
    const { send } = polyhaven({ wooden_stool_01: rawModel() })

    const [result] = await searchModels('stool', send)

    expect(result).toEqual({
      number: 1,
      id: 'wooden_stool_01',
      name: 'Wooden Stool 01',
      authors: ['Kuutti Siitonen'],
      categories: ['seating', 'furniture'],
      tags: ['stool', 'wood'],
      license: 'cc0',
      landingUrl: 'https://polyhaven.com/a/wooden_stool_01',
      thumbnail: 'https://cdn.polyhaven.com/asset_img/thumbs/x.png',
      polycount: 10946,
      dimensionsMm: [425.3, 442.3, 437.3],
      sizes: ['1k', '2k', '4k'],
      downloadCount: 100,
    })
  })

  it('ranks by how many query words match, then by download count', async () => {
    const { send } = polyhaven({
      popular_chair: rawModel({
        name: 'Chair',
        tags: [],
        categories: [],
        download_count: 900,
      }),
      wooden_chair: rawModel({
        name: 'Wooden Chair',
        tags: [],
        categories: [],
        download_count: 10,
      }),
      quiet_chair: rawModel({
        name: 'Chair',
        tags: [],
        categories: [],
        download_count: 5,
      }),
    })

    const results = await searchModels('wooden chair', send)

    expect(results.map((each) => [each.number, each.id])).toEqual([
      [1, 'wooden_chair'],
      [2, 'popular_chair'],
      [3, 'quiet_chair'],
    ])
  })

  it('matches a query word against tags and categories, ignoring case', async () => {
    const { send } = polyhaven({
      by_tag: rawModel({ name: 'A', tags: ['Rustic'], categories: [] }),
      by_category: rawModel({ name: 'B', tags: [], categories: ['rustic'] }),
    })

    const results = await searchModels('RUSTIC', send)

    expect(results.map((each) => each.id).sort()).toEqual([
      'by_category',
      'by_tag',
    ])
  })

  it('answers an empty list when nothing matches', async () => {
    const { send } = polyhaven({ stool: rawModel() })

    expect(await searchModels('smartphone', send)).toEqual([])
  })

  it('lists at most 20 results', async () => {
    const models = Object.fromEntries(
      Array.from({ length: 25 }, (_, index) => [`stool_${index}`, rawModel()]),
    )
    const { send } = polyhaven(models)

    expect(await searchModels('stool', send)).toHaveLength(20)
  })

  it('refuses source-failed when Poly Haven does not answer', async () => {
    const { send } = polyhaven({}, '/assets')

    await expect(searchModels('stool', send)).rejects.toMatchObject({
      code: 'source-failed',
      details: { source: 'polyhaven', status: 500 },
    })
  })
})

describe('modelById', () => {
  it('reads one model by its id', async () => {
    const { send, asked } = polyhaven({ wooden_stool_01: rawModel() })

    const model = await modelById('wooden_stool_01', send)

    expect(model).toMatchObject({
      id: 'wooden_stool_01',
      name: 'Wooden Stool 01',
    })
    expect(asked[0]?.url.pathname).toBe('/info/wooden_stool_01')
  })

  it('refuses result-not-found for an id Poly Haven does not hold', async () => {
    const { send } = polyhaven({})

    await expect(modelById('no_such', send)).rejects.toMatchObject({
      code: 'result-not-found',
      details: { id: 'no_such' },
    })
  })

  it('refuses result-not-found for an id naming a texture or an HDRI', async () => {
    const { send } = polyhaven({ rocks: rawModel({ type: 1 }) })

    await expect(modelById('rocks', send)).rejects.toMatchObject({
      code: 'result-not-found',
    })
  })
})

describe('fetchModel', () => {
  it('downloads the glTF and every file it includes at the size asked, with the user agent', async () => {
    const { send, asked } = polyhaven({})

    await fetchModel('stool', '2k', send)

    const downloads = asked.filter(
      (each) => each.url.host === 'dl.polyhaven.org',
    )
    expect(downloads.map((each) => each.url.pathname).sort()).toEqual([
      '/file/ph-assets/Models/gltf/2k/stool/stool_2k.gltf',
      '/file/ph-assets/Models/gltf/8k/stool/stool.bin',
      '/file/ph-assets/Models/jpg/2k/stool/stool_diff_2k.jpg',
    ])
    expect(new Set(asked.map((each) => each.userAgent))).toEqual(
      new Set([`frameboard/${version}`]),
    )
  })

  it('answers one GLB and the glTF address it was packed from', async () => {
    const { send } = polyhaven({})

    const model = await fetchModel('stool', '1k', send)

    const magic = new DataView(model.bytes.buffer).getUint32(0, true)
    expect(magic).toBe(0x46546c67)
    expect(model.url).toBe(`${DL}/gltf/1k/stool/stool_1k.gltf`)
  })

  it('refuses usage naming the sizes the model offers for one it does not', async () => {
    const { send } = polyhaven({})

    await expect(fetchModel('stool', '16k', send)).rejects.toMatchObject({
      code: 'usage',
      details: { size: '16k', sizes: ['1k', '2k'] },
    })
  })

  it('refuses source-failed rather than usage for a model Poly Haven serves as no glTF', async () => {
    const send = (async () =>
      Response.json({ blend: {}, fbx: {}, usd: {} })) as unknown as typeof fetch

    await expect(fetchModel('book', '1k', send)).rejects.toMatchObject({
      code: 'source-failed',
      details: { source: 'polyhaven', id: 'book' },
    })
  })

  it('refuses source-failed when one included file fails to download', async () => {
    const { send } = polyhaven({}, '_diff_1k.jpg')

    await expect(fetchModel('stool', '1k', send)).rejects.toMatchObject({
      code: 'source-failed',
    })
  })
})
