/** One entry of Poly Haven's model list, as the API spells it. */
export function rawModel(overrides: Record<string, unknown> = {}) {
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

export const DL = 'https://dl.polyhaven.org/file/ph-assets/Models'

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
export function polyhaven(
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
