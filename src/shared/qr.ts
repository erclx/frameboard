/**
 * A QR code encoder for one short text, being the phone link, in byte mode at
 * error correction level M. It follows ISO/IEC 18004 the way Project Nayuki's
 * reference encoder lays it out, and is written here since a dependency for
 * one link is not worth its upkeep.
 */

/** The dark modules of a code, row by row, `true` for dark. */
export type QrModules = boolean[][]

/** Error correction codewords per block at level M, indexed by version. */
const ECC_PER_BLOCK = [
  -1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26,
  26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28,
  28, 28, 28,
]

/** Error correction blocks at level M, indexed by version. */
const BLOCKS = [
  -1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17,
  18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49,
]

/** Level M's two format bits. */
const LEVEL_M_BITS = 0

const MAX_VERSION = 40

/**
 * The modules of the smallest code holding `text` as UTF-8, with its mask
 * picked by the standard's penalty score. A text past what version 40 holds
 * throws, which no link reaches.
 */
export function qrModules(text: string): QrModules {
  const data = new TextEncoder().encode(text)
  const version = smallestVersion(data.length)
  const codewords = addErrorCorrection(dataCodewords(data, version), version)

  const size = version * 4 + 17
  const grid = new Grid(size)
  drawFunctionPatterns(grid, version)
  drawCodewords(grid, codewords)

  let best: { penalty: number; modules: QrModules } | null = null
  for (let mask = 0; mask < 8; mask++) {
    const masked = grid.copy()
    applyMask(masked, mask)
    drawFormatBits(masked, mask)
    const penalty = penaltyScore(masked.modules)
    if (!best || penalty < best.penalty) {
      best = { penalty, modules: masked.modules }
    }
  }
  return best?.modules ?? []
}

class Grid {
  readonly modules: QrModules
  readonly reserved: boolean[][]

  constructor(
    readonly size: number,
    modules?: QrModules,
    reserved?: boolean[][],
  ) {
    this.modules =
      modules ??
      Array.from({ length: size }, () => Array<boolean>(size).fill(false))
    this.reserved =
      reserved ??
      Array.from({ length: size }, () => Array<boolean>(size).fill(false))
  }

  /** Sets a function module, which no data bit or mask touches. */
  setFunction(x: number, y: number, dark: boolean): void {
    this.set(x, y, dark)
    const row = this.reserved[y]
    if (row) row[x] = true
  }

  set(x: number, y: number, dark: boolean): void {
    const row = this.modules[y]
    if (row) row[x] = dark
  }

  get(x: number, y: number): boolean {
    return this.modules[y]?.[x] ?? false
  }

  isReserved(x: number, y: number): boolean {
    return this.reserved[y]?.[x] ?? false
  }

  copy(): Grid {
    return new Grid(
      this.size,
      this.modules.map((row) => [...row]),
      this.reserved,
    )
  }
}

/** The data codewords a version holds at level M. */
function dataCapacity(version: number): number {
  return (
    Math.floor(rawModules(version) / 8) -
    (ECC_PER_BLOCK[version] ?? 0) * (BLOCKS[version] ?? 0)
  )
}

/** The modules left for codewords once the function patterns are drawn. */
function rawModules(version: number): number {
  let result = (16 * version + 128) * version + 64
  if (version >= 2) {
    const align = Math.floor(version / 7) + 2
    result -= (25 * align - 10) * align - 55
    if (version >= 7) result -= 36
  }
  return result
}

function smallestVersion(bytes: number): number {
  for (let version = 1; version <= MAX_VERSION; version++) {
    const countBits = version <= 9 ? 8 : 16
    if (4 + countBits + bytes * 8 <= dataCapacity(version) * 8) return version
  }
  throw new Error(`A QR code holds no text of ${bytes} bytes`)
}

/** Mode, count, bytes, terminator, then the alternating pad bytes. */
function dataCodewords(data: Uint8Array, version: number): number[] {
  const bits: number[] = []
  const push = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1)
  }
  push(0b0100, 4)
  push(data.length, version <= 9 ? 8 : 16)
  for (const byte of data) push(byte, 8)

  const capacity = dataCapacity(version) * 8
  push(0, Math.min(4, capacity - bits.length))
  push(0, (8 - (bits.length % 8)) % 8)
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) {
    push(pad, 8)
  }

  const codewords: number[] = []
  for (let i = 0; i < bits.length; i += 8) {
    codewords.push(
      bits.slice(i, i + 8).reduce((byte, bit) => (byte << 1) | bit, 0),
    )
  }
  return codewords
}

/** Splits the data into blocks, appends each block's ECC, and interleaves them. */
function addErrorCorrection(data: number[], version: number): number[] {
  const blockCount = BLOCKS[version] ?? 1
  const eccLength = ECC_PER_BLOCK[version] ?? 0
  const raw = Math.floor(rawModules(version) / 8)
  const shortBlocks = blockCount - (raw % blockCount)
  const shortLength = Math.floor(raw / blockCount)
  const divisor = reedSolomonDivisor(eccLength)

  const blocks: number[][] = []
  for (let i = 0, at = 0; i < blockCount; i++) {
    const length = shortLength - eccLength + (i < shortBlocks ? 0 : 1)
    const block = data.slice(at, at + length)
    at += length
    const ecc = reedSolomonRemainder(block, divisor)
    // A short block gets a placeholder so every block indexes alike.
    if (i < shortBlocks) block.push(-1)
    blocks.push([...block, ...ecc])
  }

  const result: number[] = []
  for (let i = 0; i < (blocks[0]?.length ?? 0); i++) {
    blocks.forEach((block, index) => {
      const skip = i === shortLength - eccLength && index < shortBlocks
      if (!skip) result.push(block[i] ?? 0)
    })
  }
  return result
}

function reedSolomonDivisor(degree: number): number[] {
  const result = Array<number>(degree).fill(0)
  result[degree - 1] = 1
  let root = 1
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = multiply(result[j] ?? 0, root)
      if (j + 1 < degree) result[j] = (result[j] ?? 0) ^ (result[j + 1] ?? 0)
    }
    root = multiply(root, 0x02)
  }
  return result
}

function reedSolomonRemainder(data: number[], divisor: number[]): number[] {
  const result = divisor.map(() => 0)
  for (const byte of data) {
    const factor = byte ^ (result.shift() ?? 0)
    result.push(0)
    divisor.forEach((coefficient, i) => {
      result[i] = (result[i] ?? 0) ^ multiply(coefficient, factor)
    })
  }
  return result
}

/** Multiplication in GF(2^8) modulo the QR polynomial 0x11D. */
function multiply(x: number, y: number): number {
  let z = 0
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d)
    z ^= ((y >>> i) & 1) * x
  }
  return z
}

function drawFunctionPatterns(grid: Grid, version: number): void {
  const { size } = grid
  for (let i = 0; i < size; i++) {
    grid.setFunction(6, i, i % 2 === 0)
    grid.setFunction(i, 6, i % 2 === 0)
  }
  drawFinder(grid, 3, 3)
  drawFinder(grid, size - 4, 3)
  drawFinder(grid, 3, size - 4)

  const positions = alignmentPositions(version, size)
  const last = positions.length - 1
  positions.forEach((x, i) => {
    positions.forEach((y, j) => {
      const onFinder =
        (i === 0 && j === 0) ||
        (i === 0 && j === last) ||
        (i === last && j === 0)
      if (!onFinder) drawAlignment(grid, x, y)
    })
  })

  // Reserve the format areas now, with the dark module, and draw them per mask.
  drawFormatBits(grid, 0)
  drawVersionBits(grid, version)
}

function drawFinder(grid: Grid, cx: number, cy: number): void {
  for (let dy = -4; dy <= 4; dy++) {
    for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx
      const y = cy + dy
      if (x < 0 || y < 0 || x >= grid.size || y >= grid.size) continue
      const distance = Math.max(Math.abs(dx), Math.abs(dy))
      grid.setFunction(x, y, distance !== 2 && distance !== 4)
    }
  }
}

function drawAlignment(grid: Grid, cx: number, cy: number): void {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      grid.setFunction(
        cx + dx,
        cy + dy,
        Math.max(Math.abs(dx), Math.abs(dy)) !== 1,
      )
    }
  }
}

function alignmentPositions(version: number, size: number): number[] {
  if (version === 1) return []
  const count = Math.floor(version / 7) + 2
  const step = Math.floor((version * 8 + count * 3 + 5) / (count * 4 - 4)) * 2
  const result = [6]
  for (let position = size - 7; result.length < count; position -= step) {
    result.splice(1, 0, position)
  }
  return result
}

function drawFormatBits(grid: Grid, mask: number): void {
  const data = (LEVEL_M_BITS << 3) | mask
  let remainder = data
  for (let i = 0; i < 10; i++)
    remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537)
  const bits = ((data << 10) | remainder) ^ 0x5412
  const bit = (i: number) => ((bits >>> i) & 1) !== 0
  const { size } = grid

  for (let i = 0; i <= 5; i++) grid.setFunction(8, i, bit(i))
  grid.setFunction(8, 7, bit(6))
  grid.setFunction(8, 8, bit(7))
  grid.setFunction(7, 8, bit(8))
  for (let i = 9; i < 15; i++) grid.setFunction(14 - i, 8, bit(i))

  for (let i = 0; i < 8; i++) grid.setFunction(size - 1 - i, 8, bit(i))
  for (let i = 8; i < 15; i++) grid.setFunction(8, size - 15 + i, bit(i))
  grid.setFunction(8, size - 8, true)
}

function drawVersionBits(grid: Grid, version: number): void {
  if (version < 7) return
  let remainder = version
  for (let i = 0; i < 12; i++)
    remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25)
  const bits = (version << 12) | remainder
  for (let i = 0; i < 18; i++) {
    const dark = ((bits >>> i) & 1) !== 0
    const a = grid.size - 11 + (i % 3)
    const b = Math.floor(i / 3)
    grid.setFunction(a, b, dark)
    grid.setFunction(b, a, dark)
  }
}

/** Places the codewords in the two-column zigzag from the bottom right. */
function drawCodewords(grid: Grid, codewords: number[]): void {
  const { size } = grid
  let i = 0
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let vertical = 0; vertical < size; vertical++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j
        const upward = ((right + 1) & 2) === 0
        const y = upward ? size - 1 - vertical : vertical
        if (grid.isReserved(x, y) || i >= codewords.length * 8) continue
        grid.set(
          x,
          y,
          (((codewords[i >>> 3] ?? 0) >>> (7 - (i & 7))) & 1) !== 0,
        )
        i++
      }
    }
  }
}

const MASKS: ((x: number, y: number) => boolean)[] = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
]

function applyMask(grid: Grid, mask: number): void {
  const flips = MASKS[mask]
  if (!flips) return
  for (let y = 0; y < grid.size; y++) {
    for (let x = 0; x < grid.size; x++) {
      if (!grid.isReserved(x, y) && flips(x, y)) {
        grid.set(x, y, !grid.get(x, y))
      }
    }
  }
}

/**
 * The standard's four penalty rules, summed, lower being easier to scan. The
 * standard leaves the finder-like rule's edges open, so it is counted inside
 * the line, as the `qrcode` package does, which keeps both picking one mask.
 */
function penaltyScore(modules: QrModules): number {
  const size = modules.length
  const at = (x: number, y: number) => modules[y]?.[x] ?? false
  let result = 0

  for (const horizontal of [true, false]) {
    for (let a = 0; a < size; a++) {
      let run = 0
      let previous: boolean | null = null
      let window = 0
      for (let b = 0; b < size; b++) {
        const dark = horizontal ? at(b, a) : at(a, b)
        if (dark === previous) {
          run++
        } else {
          if (run >= 5) result += run - 2
          run = 1
          previous = dark
        }
        window = ((window << 1) & 0x7ff) | (dark ? 1 : 0)
        if (b >= 10 && (window === 0x5d0 || window === 0x05d)) result += 40
      }
      if (run >= 5) result += run - 2
    }
  }

  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const dark = at(x, y)
      if (
        dark === at(x + 1, y) &&
        dark === at(x, y + 1) &&
        dark === at(x + 1, y + 1)
      ) {
        result += 3
      }
    }
  }

  const dark = modules.flat().filter(Boolean).length
  return (
    result + Math.abs(Math.ceil((dark * 100) / (size * size) / 5) - 10) * 10
  )
}
