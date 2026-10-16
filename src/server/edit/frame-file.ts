import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

import { contentHash } from './address'
import {
  applyEdit,
  type EditChange,
  type EditRefused,
  type ElementAddress,
  refuse,
} from './apply'

export type FrameFileEdit =
  | {
      readonly ok: true
      /** The file's hash after the edit, which the next edit is made from. */
      readonly hash: string
    }
  | EditRefused

function stale(path: string): EditRefused {
  return refuse(
    'stale-address',
    `${basename(path)} changed after this edit was made, so nothing was written`,
  )
}

/**
 * Edits one element of a frame file and replaces the file through a
 * temporary file and a rename. A file whose bytes do not survive a UTF-8
 * round trip is refused, since decoding would rewrite every invalid byte. An
 * address carrying a hash the file no longer has is refused as stale, and the
 * file is read again just before the rename so a write landing meanwhile is
 * refused rather than overwritten. No lock is taken, since an agent's raw
 * write never takes one and the hash is what protects a hand edit.
 */
export function editFrameFile(
  path: string,
  address: ElementAddress,
  change: EditChange,
): FrameFileEdit {
  const bytes = readFileSync(path)
  const source = bytes.toString('utf8')
  if (!Buffer.from(source, 'utf8').equals(bytes)) {
    return refuse(
      'invalid-utf8',
      `${basename(path)} is not valid UTF-8, so writing it back would change bytes outside the edit`,
    )
  }
  const hash = contentHash(bytes)
  if (address.hash !== undefined && address.hash !== hash) return stale(path)

  const applied = applyEdit(source, address, change)
  if (!applied.ok) return applied

  // A leading dot keeps the temporary file from reading as a frame.
  const temp = join(dirname(path), `.${basename(path)}.${process.pid}.tmp`)
  writeFileSync(temp, applied.html)
  if (contentHash(readFileSync(path)) !== hash) {
    rmSync(temp, { force: true })
    return stale(path)
  }
  renameSync(temp, path)
  return { ok: true, hash: contentHash(applied.html) }
}
