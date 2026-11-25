/**
 * Preloaded into a `serve` child with `node --import`, standing in for
 * Openverse and its image hosts, so a spec finds and saves images with no
 * network. Every other request goes to the real `fetch`.
 */

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

const IMAGES = ['glass', 'cabin', 'barn', 'villa'].map((id) => ({
  id,
  title: `${id[0].toUpperCase()}${id.slice(1)} house`,
  creator: 'Ann',
  creator_url: null,
  license: 'cc0',
  license_version: '1.0',
  license_url: 'https://creativecommons.org/publicdomain/zero/1.0/',
  attribution: `${id} by Ann is marked with CC0 1.0.`,
  foreign_landing_url: `https://www.flickr.com/photos/${id}`,
  url: `https://images.example.org/${id}.png`,
  thumbnail: null,
  width: 1,
  height: 1,
}))

// Its thumbnail's host never answers a browser, so its tile names the PNG it is.
IMAGES.push({
  ...IMAGES[0],
  id: 'plan',
  title: 'Plan house',
  url: 'https://images.example.org/plan.png',
  thumbnail: 'https://thumbnails.invalid/plan',
})

const realFetch = globalThis.fetch

globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input))
  if (url.host === 'images.example.org') {
    return new Response(PNG, { headers: { 'content-type': 'image/png' } })
  }
  if (url.host !== 'api.openverse.org') return realFetch(input, init)
  const id = /\/v1\/images\/([^/]+)\/$/.exec(url.pathname)?.[1]
  if (id === undefined) return Response.json({ results: IMAGES })
  const image = IMAGES.find((each) => each.id === id)
  return image ? Response.json(image) : new Response('{}', { status: 404 })
}
