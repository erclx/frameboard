import { FrameboardError } from '@/shared/errors'

const GLB_MAGIC = 0x46546c67
const GLB_VERSION = 2
const JSON_CHUNK = 0x4e4f534a
const BIN_CHUNK = 0x004e4942
const HEADER_BYTES = 12
const CHUNK_HEADER_BYTES = 8

/** The texture formats a glTF viewer reads with no extension named. */
const IMAGE_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
}

interface Part {
  bytes: Uint8Array
  /** From the start of the binary chunk's data, always a multiple of 4. */
  offset: number
}

interface BufferView {
  buffer: number
  byteOffset: number
  byteLength: number
}

/**
 * Packs a glTF and the files `files` holds by the URI it names into one GLB
 * naming no outside file. Refuses `source-failed` for anything it cannot pack
 * whole rather than writing a file a viewer cannot load.
 */
export function packGlb(
  gltf: Record<string, unknown>,
  files: ReadonlyMap<string, Uint8Array>,
): Uint8Array {
  const buffers = listOf(gltf.buffers)
  if (buffers.length > 1) {
    throw refused(`The glTF names ${buffers.length} buffers, and one packs.`)
  }
  const parts: Part[] = []
  let length = 0
  const append = (bytes: Uint8Array): number => {
    const offset = length
    parts.push({ bytes, offset })
    length = align(offset + bytes.byteLength)
    return offset
  }

  const buffer = buffers[0]
  if (buffer !== undefined) {
    const declared = buffer.byteLength
    if (typeof declared !== 'number') {
      throw refused('The glTF buffer states no byteLength.')
    }
    const bytes = fileFor(buffer.uri, files)
    if (bytes.byteLength < declared) {
      throw refused(
        `The buffer holds ${bytes.byteLength} bytes, short of the ${declared} the glTF states.`,
      )
    }
    append(bytes.subarray(0, declared))
  }

  const views = listOf(gltf.bufferViews) as unknown as BufferView[]
  const packedViews: BufferView[] = [...views]
  const images = listOf(gltf.images).map((image) => {
    if (image.uri === undefined) return image
    const bytes = fileFor(image.uri, files)
    const mimeType = mimeTypeOf(image)
    const byteOffset = append(bytes)
    packedViews.push({ buffer: 0, byteOffset, byteLength: bytes.byteLength })
    const { uri: _uri, ...rest } = image
    return { ...rest, bufferView: packedViews.length - 1, mimeType }
  })

  const json: Record<string, unknown> = { ...gltf }
  delete json.buffers
  delete json.bufferViews
  if (length > 0) json.buffers = [{ byteLength: length }]
  if (packedViews.length > 0) json.bufferViews = packedViews
  if (gltf.images !== undefined) json.images = images
  return container(json, parts, length)
}

function container(
  json: Record<string, unknown>,
  parts: Part[],
  binLength: number,
): Uint8Array {
  const text = new TextEncoder().encode(JSON.stringify(json))
  const jsonLength = align(text.byteLength)
  const binChunk = binLength === 0 ? 0 : CHUNK_HEADER_BYTES + binLength
  const total = HEADER_BYTES + CHUNK_HEADER_BYTES + jsonLength + binChunk
  const glb = new Uint8Array(total)
  const view = new DataView(glb.buffer)
  view.setUint32(0, GLB_MAGIC, true)
  view.setUint32(4, GLB_VERSION, true)
  view.setUint32(8, total, true)
  view.setUint32(12, jsonLength, true)
  view.setUint32(16, JSON_CHUNK, true)
  glb.set(text, 20)
  // The spec pads the JSON chunk with spaces and the binary chunk with zeros.
  glb.fill(0x20, 20 + text.byteLength, 20 + jsonLength)
  if (binChunk === 0) return glb
  const binStart = 20 + jsonLength
  view.setUint32(binStart, binLength, true)
  view.setUint32(binStart + 4, BIN_CHUNK, true)
  const dataStart = binStart + CHUNK_HEADER_BYTES
  for (const part of parts) glb.set(part.bytes, dataStart + part.offset)
  return glb
}

function fileFor(
  uri: unknown,
  files: ReadonlyMap<string, Uint8Array>,
): Uint8Array {
  if (typeof uri !== 'string' || uri === '') {
    throw refused('The glTF names a buffer or image with no uri.')
  }
  if (uri.startsWith('data:')) {
    throw refused(
      'The glTF carries a data URI, which this packer does not read.',
    )
  }
  const bytes = files.get(uri) ?? files.get(safeDecode(uri))
  if (bytes === undefined) {
    throw refused(`The glTF names ${uri}, which was not downloaded.`)
  }
  return bytes
}

function mimeTypeOf(image: Record<string, unknown>): string {
  if (typeof image.mimeType === 'string') {
    if (Object.values(IMAGE_TYPES).includes(image.mimeType)) {
      return image.mimeType
    }
    throw refused(`The glTF names a texture of type ${image.mimeType}.`)
  }
  const uri = String(image.uri)
  const extension = uri.slice(uri.lastIndexOf('.') + 1).toLowerCase()
  const type = IMAGE_TYPES[extension]
  if (type === undefined) {
    throw refused(`The texture ${uri} is neither JPEG nor PNG.`)
  }
  return type
}

function listOf(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter(
        (each): each is Record<string, unknown> =>
          typeof each === 'object' && each !== null,
      )
    : []
}

function safeDecode(uri: string): string {
  try {
    return decodeURIComponent(uri)
  } catch {
    return uri
  }
}

function align(length: number): number {
  return Math.ceil(length / 4) * 4
}

function refused(message: string): FrameboardError {
  return new FrameboardError('source-failed', message, { source: 'polyhaven' })
}
