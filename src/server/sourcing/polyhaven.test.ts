import { describe, expect, it } from 'vitest'

import { version } from '@/shared/version'

import { fetchModel, modelById, searchModels } from './polyhaven'

/** One entry of Poly Haven's model list, as the API spells it. */
function rawModel(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Wooden Stool 01',
    type: 2,
    authors: { 'Kuutti Siitonen': 'All' },
    categories: ['seating', 'furniture'],
    tags: ['stool', 'wood'],
    max_resolution: [4096, 4096],
    polycount: 10946,
    dimensions: [425.3, 442.3, 437.3],
    download_count: 100,
    thumbnail_url: 'https://cdn.polyhaven.com/asset_img/thumbs/x.png',
    ...overrides,
  }
}

const DL = 'https://dl.polyhaven.org/file/ph-assets/Models'

/** The `files` record for one model offering 1k and 2k, each naming a shared buffer and one texture. */
function filesRecord(id: string) {
  const size = (name: string) => ({
    gltf: {
      url: `${DL}/gltf/${name}/${id}/${id}_${name}.gltf`,
      include: {
        [`${id}.bin`]: { url: `${DL}/gltf/8k/${id}/${id}.bin` },
        [`textures/${id}_diff_${name}.jpg`]: {
          url: `${DL}/jpg/${name}/${id}/${id}_diff_${name}.jpg`,
        },
      },
    },
  })
  return { gltf: { '1k': size('1k'), '2k': size('2k') } }
}

function gltfFile(id: string, name: string) {
  return {
    asset: { version: '2.0' },
    buffers: [{ byteLength: 4, uri: `${id}.bin` }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 4 }],
    images: [{ uri: `textures/${id}_diff_${name}.jpg` }],
  }
}

interface Asked {
  url: URL
  userAgent: string | null
}

/**
 * A fake Poly Haven holding the given model list, answering `info` for an id
 * in it, `files` for any id, and every download URL. `failing` names a URL
 * fragment the host answers 500 for. Every request is recorded.
 */
function polyhaven(
  models: Record<string, unknown>,
  failing: string | null = null,
) {
  const asked: Asked[] = []
  const send = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input)
    asked.push({
      url,
      userAgent: new Headers(init?.headers).get('User-Agent'),
    })
    if (failing !== null && url.href.includes(failing)) {
      return new Response('', { status: 500 })
    }
    if (url.pathname === '/assets') return Response.json(models)
    const info = /^\/info\/(.+)$/.exec(url.pathname)
    if (info) {
      const raw = models[info[1] ?? '']
      return raw === undefined
        ? new Response(`No asset with id ${info[1]}`, { status: 404 })
        : Response.json(raw)
    }
    const files = /^\/files\/(.+)$/.exec(url.pathname)
    if (files) return Response.json(filesRecord(files[1] ?? ''))
    const gltf = /\/gltf\/(\w+)\/(\w+)\/\w+\.gltf$/.exec(url.pathname)
    if (gltf) return Response.json(gltfFile(gltf[2] ?? '', gltf[1] ?? ''))
    return new Response(new Uint8Array([1, 2, 3, 4]))
  }) as typeof fetch
  return { send, asked }
}

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

  it('refuses source-failed when one included file fails to download', async () => {
    const { send } = polyhaven({}, '_diff_1k.jpg')

    await expect(fetchModel('stool', '1k', send)).rejects.toMatchObject({
      code: 'source-failed',
    })
  })
})
