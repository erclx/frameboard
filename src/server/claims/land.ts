import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { FrameboardError } from '@/shared/errors'
import type { Claim, ClaimBox } from '@/shared/records/claims'

import { layoutAt, withLayouts } from '../board/frames'
import { updateRecord } from '../board/json-record'
import { FRAME_EXTENSION } from '../board/scan'
import { claimsPath, claimsSpec, readClaims } from './store'

interface Due {
  claim: Claim & { box: ClaimBox }
  page: string
  name: string
}

/**
 * Moves each reserved frame whose file now exists from its claim into the
 * layout: an entry at the claim's box on top of its page, unless the page
 * already holds one, then the claim drops its box and holds the frame as any
 * editing claim does. Answers the refs it landed, and none when the claims
 * file does not parse.
 */
export async function landReserved(root: string, now: Date): Promise<string[]> {
  let claims: Claim[]
  try {
    claims = await readClaims(root, now)
  } catch (error) {
    if (error instanceof FrameboardError) return []
    throw error
  }
  const due = claims.flatMap((claim): Due[] => {
    const { box } = claim
    const [project, page, name] = claim.frame.split('/')
    if (!box || !project || !page || !name) return []
    const dir = join(root, project, page)
    return existsSync(join(dir, `${name}${FRAME_EXTENSION}`))
      ? [{ claim: { ...claim, box }, page: dir, name }]
      : []
  })
  if (due.length === 0) return []

  await withLayouts(
    due.map((each) => each.page),
    async (layouts) => {
      for (const { claim, page, name } of due) {
        const layout = layoutAt(layouts, page)
        if (layout.hasEntry(name) || !layout.names.includes(name)) continue
        const { x, y, width, height, hugWidth, hugHeight } = claim.box
        layout.set(name, {
          box: { x, y, width, height },
          order: layout.placement(name).order,
          hidden: false,
          locked: false,
          hugWidth: hugWidth ?? false,
          hugHeight: hugHeight ?? false,
          scroll: false,
          placed: true,
        })
        layout.renumber()
      }
    },
  )

  const landed = new Set(due.map((each) => each.claim.frame))
  await updateRecord(claimsPath(root), claimsSpec, (file) => ({
    ...file,
    claims: file.claims.map((each) => {
      if (!landed.has(each.frame) || !each.box) return each
      const { box: _box, ...rest } = each
      return rest
    }),
  }))
  return [...landed]
}
