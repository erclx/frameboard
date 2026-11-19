/**
 * Preloaded into a `serve` child with `node --import`, standing in for
 * Poly Haven's API and its download host, so a spec finds and saves models
 * with no network. Every other request goes to the next `fetch`.
 */

const DL = 'https://dl.polyhaven.org/file/ph-assets/Models'

const MODELS = {
  wooden_stool_01: {
    name: 'Wooden Stool 01',
    type: 2,
    authors: { Ann: 'All' },
    categories: ['seating'],
    tags: ['stool', 'wood'],
    max_resolution: [1024, 1024],
    polycount: 2728,
    dimensions: [425, 442, 437],
    download_count: 100,
    thumbnail_url: null,
  },
}

/** One 1k glTF naming a four-byte buffer and one texture, as Poly Haven's `files` lists it. */
function files(id) {
  return {
    gltf: {
      '1k': {
        gltf: {
          url: `${DL}/gltf/1k/${id}/${id}_1k.gltf`,
          include: {
            [`${id}.bin`]: { url: `${DL}/gltf/1k/${id}/${id}.bin` },
            [`textures/${id}_diff_1k.jpg`]: {
              url: `${DL}/jpg/1k/${id}/${id}_diff_1k.jpg`,
            },
          },
        },
      },
    },
  }
}

function gltf(id) {
  return {
    asset: { version: '2.0' },
    buffers: [{ byteLength: 4, uri: `${id}.bin` }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 4 }],
    images: [{ uri: `textures/${id}_diff_1k.jpg` }],
  }
}

const nextFetch = globalThis.fetch

globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input))
  if (url.host === 'dl.polyhaven.org') {
    const named = /\/gltf\/1k\/(\w+)\/\w+\.gltf$/.exec(url.pathname)
    return named
      ? Response.json(gltf(named[1]))
      : new Response(new Uint8Array([1, 2, 3, 4]))
  }
  if (url.host !== 'api.polyhaven.com') return nextFetch(input, init)
  if (url.pathname === '/assets') return Response.json(MODELS)
  const info = /^\/info\/(.+)$/.exec(url.pathname)?.[1]
  if (info !== undefined) {
    return MODELS[info]
      ? Response.json(MODELS[info])
      : new Response('', { status: 404 })
  }
  const id = /^\/files\/(.+)$/.exec(url.pathname)?.[1]
  return id ? Response.json(files(id)) : new Response('', { status: 404 })
}
