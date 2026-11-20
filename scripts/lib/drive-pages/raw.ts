import { join } from 'node:path'

import { layOne } from '../drive-seed.ts'

/**
 * A frame stating one raw color matching a token and one matching none, so the
 * `Use <token>` swap has a row to offer and a row to leave plain.
 */
const RAW = { project: 'webapp', page: 'raw', frame: 'swatches' }

const RAW_PAGE = join(import.meta.dirname, '../drive-raw.html')

export function lay(root: string): Promise<'laid' | 'kept'> {
  return layOne(root, RAW, RAW_PAGE)
}
