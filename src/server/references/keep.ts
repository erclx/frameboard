/** One reference's files: what its PNGs are drawn from, and the PNGs. */
export interface ReferenceFiles {
  /** The frame HTML and every asset it loads, as folder paths. */
  sources: readonly string[]
  images: readonly string[]
}

type Files = ReadonlyMap<string, string | Uint8Array>

/**
 * The held PNGs a sync leaves in place, sorted: each whose reference's HTML
 * and assets match what the folder holds and whose capture kept its size. A
 * PNG varies with the browser and its fonts, so re-capturing an unchanged
 * frame would rewrite it with no design change.
 */
export function keptImages(
  references: readonly ReferenceFiles[],
  captured: Files,
  held: Files,
): string[] {
  return references
    .filter(({ sources }) =>
      sources.every((path) => sameBytes(captured.get(path), held.get(path))),
    )
    .flatMap(({ images }) =>
      images.filter((path) => sameSize(captured.get(path), held.get(path))),
    )
    .sort()
}

function sameBytes(
  a: string | Uint8Array | undefined,
  b: string | Uint8Array | undefined,
): boolean {
  return (
    a !== undefined && b !== undefined && Buffer.from(a).equals(Buffer.from(b))
  )
}

/** Whether both are held and the same size, or not PNGs to read a size from. */
function sameSize(
  a: string | Uint8Array | undefined,
  b: string | Uint8Array | undefined,
): boolean {
  if (a === undefined || b === undefined) return false
  const first = pngSize(Buffer.from(a))
  const second = pngSize(Buffer.from(b))
  if (!first || !second) return true
  return first.width === second.width && first.height === second.height
}

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** The size a PNG's header states, which always opens on its IHDR chunk. */
function pngSize(bytes: Buffer): { width: number; height: number } | undefined {
  if (bytes.length < 24 || !bytes.subarray(0, 8).equals(SIGNATURE)) return
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}
