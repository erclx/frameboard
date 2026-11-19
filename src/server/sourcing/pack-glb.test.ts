import { describe, expect, it } from 'vitest'

import { FrameboardError } from '@/shared/errors'

import { packGlb } from './pack-glb'

/** A glTF naming one external buffer and the given images, as Poly Haven serves one. */
function gltfWith(
  bufferLength: number,
  images: Array<Record<string, unknown>>,
): Record<string, unknown> {
  return {
    asset: { version: '2.0' },
    buffers: [{ byteLength: bufferLength, uri: 'stool.bin' }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: bufferLength }],
    images,
    textures: images.map((_, source) => ({ source })),
  }
}

function filesOf(entries: Record<string, number[]>): Map<string, Uint8Array> {
  return new Map(
    Object.entries(entries).map(([uri, bytes]) => [uri, new Uint8Array(bytes)]),
  )
}

/** The header, the JSON chunk as an object, and the binary chunk's bytes. */
function readGlb(glb: Uint8Array) {
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength)
  const jsonLength = view.getUint32(12, true)
  const json = JSON.parse(
    new TextDecoder().decode(glb.subarray(20, 20 + jsonLength)),
  ) as Record<string, unknown> & {
    buffers: Array<Record<string, unknown>>
    bufferViews: Array<{ byteOffset: number; byteLength: number }>
    images: Array<Record<string, unknown>>
  }
  const binStart = 20 + jsonLength
  const binLength = view.getUint32(binStart, true)
  return {
    magic: view.getUint32(0, true),
    version: view.getUint32(4, true),
    length: view.getUint32(8, true),
    jsonLength,
    jsonType: view.getUint32(16, true),
    json,
    binLength,
    binType: view.getUint32(binStart + 4, true),
    bin: glb.subarray(binStart + 8, binStart + 8 + binLength),
  }
}

function refusal(run: () => unknown): FrameboardError {
  try {
    run()
  } catch (error) {
    if (error instanceof FrameboardError) return error
    throw error
  }
  throw new Error('expected a refusal')
}

describe('packGlb', () => {
  it('writes a glTF 2 header whose length is the whole file', () => {
    const glb = packGlb(gltfWith(4, []), filesOf({ 'stool.bin': [1, 2, 3, 4] }))

    const read = readGlb(glb)

    expect(read.magic).toBe(0x46546c67)
    expect(read.version).toBe(2)
    expect(read.length).toBe(glb.byteLength)
  })

  it('writes a JSON chunk then one binary chunk, each a multiple of 4 bytes', () => {
    const glb = packGlb(
      gltfWith(5, []),
      filesOf({ 'stool.bin': [1, 2, 3, 4, 5] }),
    )

    const read = readGlb(glb)

    expect(read.jsonType).toBe(0x4e4f534a)
    expect(read.binType).toBe(0x004e4942)
    expect(read.jsonLength % 4).toBe(0)
    expect(read.binLength).toBe(8)
    expect([...read.bin]).toEqual([1, 2, 3, 4, 5, 0, 0, 0])
  })

  it('names one buffer with no uri, keeping the original views at their offsets', () => {
    const glb = packGlb(
      gltfWith(5, []),
      filesOf({ 'stool.bin': [1, 2, 3, 4, 5] }),
    )

    const { json } = readGlb(glb)

    expect(json.buffers).toEqual([{ byteLength: 8 }])
    expect(json.bufferViews[0]).toEqual({
      buffer: 0,
      byteOffset: 0,
      byteLength: 5,
    })
  })

  it('packs a texture named with a path as an aligned image view with its MIME type and no uri', () => {
    const gltf = gltfWith(5, [
      { name: 'diff', uri: 'textures/stool_diff_1k.jpg' },
    ])
    const files = filesOf({
      'stool.bin': [1, 2, 3, 4, 5],
      'textures/stool_diff_1k.jpg': [9, 8, 7],
    })

    const { json, bin } = readGlb(packGlb(gltf, files))

    expect(json.images).toEqual([
      { name: 'diff', bufferView: 1, mimeType: 'image/jpeg' },
    ])
    expect(json.bufferViews[1]).toEqual({
      buffer: 0,
      byteOffset: 8,
      byteLength: 3,
    })
    expect([...bin.subarray(8, 11)]).toEqual([9, 8, 7])
  })

  it('keeps an image MIME type the glTF declares', () => {
    const gltf = gltfWith(4, [{ uri: 'leaf', mimeType: 'image/png' }])
    const files = filesOf({ 'stool.bin': [1, 2, 3, 4], leaf: [5] })

    const { json } = readGlb(packGlb(gltf, files))

    expect(json.images[0]).toMatchObject({ mimeType: 'image/png' })
  })

  it('finds a file the glTF names percent-encoded', () => {
    const gltf = gltfWith(4, [{ uri: 'textures/my%20leaf.png' }])
    const files = filesOf({
      'stool.bin': [1, 2, 3, 4],
      'textures/my leaf.png': [5],
    })

    const { json } = readGlb(packGlb(gltf, files))

    expect(json.images[0]).toMatchObject({ bufferView: 1 })
  })

  it('refuses a glTF naming more than one buffer', () => {
    const gltf = {
      ...gltfWith(4, []),
      buffers: [
        { byteLength: 4, uri: 'a.bin' },
        { byteLength: 4, uri: 'b.bin' },
      ],
    }

    const error = refusal(() =>
      packGlb(gltf, filesOf({ 'a.bin': [1, 2, 3, 4], 'b.bin': [1, 2, 3, 4] })),
    )

    expect(error.code).toBe('source-failed')
  })

  it('refuses a buffer carried as a data URI', () => {
    const gltf = {
      ...gltfWith(4, []),
      buffers: [
        { byteLength: 4, uri: 'data:application/octet-stream;base64,AQIDBA==' },
      ],
    }

    expect(refusal(() => packGlb(gltf, filesOf({}))).code).toBe('source-failed')
  })

  it('refuses a buffer shorter than the length the glTF declares', () => {
    const error = refusal(() =>
      packGlb(gltfWith(8, []), filesOf({ 'stool.bin': [1, 2, 3, 4] })),
    )

    expect(error.code).toBe('source-failed')
  })

  it('refuses a file the glTF names that was not downloaded', () => {
    const gltf = gltfWith(4, [{ uri: 'textures/missing.jpg' }])

    const error = refusal(() =>
      packGlb(gltf, filesOf({ 'stool.bin': [1, 2, 3, 4] })),
    )

    expect(error.code).toBe('source-failed')
  })

  it('refuses a texture in a format a viewer does not read', () => {
    const gltf = gltfWith(4, [{ uri: 'textures/leaf.ktx2' }])
    const files = filesOf({
      'stool.bin': [1, 2, 3, 4],
      'textures/leaf.ktx2': [5],
    })

    expect(refusal(() => packGlb(gltf, files)).code).toBe('source-failed')
  })
})
