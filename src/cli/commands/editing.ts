import { existsSync } from 'node:fs'

import { type Command, Option } from 'commander'

import { hugsOf, sizeOf, type SizeOptions } from '@/server/board/frames'
import { type ResolvedRef, resolveFrameRef } from '@/server/board/refs'
import { type Box, scanPage } from '@/server/board/scan'
import {
  claim,
  readClaims,
  release,
  type Reservation,
  reserve,
} from '@/server/claims/store'
import { FrameboardError } from '@/shared/errors'
import {
  DEFAULT_FRAME_SIZE,
  FRAME_GAP,
  FRAME_SIZE_NAMES,
  FRAME_SIZES,
} from '@/shared/frame-sizes'
import { drawnExtent } from '@/shared/frame-widths'
import type { Claim } from '@/shared/records/claims'

import {
  act,
  addVerb,
  boardOf,
  type CommonOptions,
  parseInteger,
  type ProgramContext,
} from '../program'
import { DEFAULT_AGENT, SESSION_ENV, sessionOf, tagFor } from '../session'

interface EditingOptions extends CommonOptions, SizeOptions {
  release?: boolean
  new?: boolean
  session?: string
  agent: string
  x?: number
  y?: number
}

const ANY_INTEGER = parseInteger(Number.MIN_SAFE_INTEGER)

export function registerEditing(
  program: Command,
  context: ProgramContext,
): void {
  const { io } = context
  const command = addVerb(
    program,
    'editing',
    'Claim a frame before rewriting it, so the board shows it and another session is told it is taken. With --new, reserve frames not written yet, so the board shows where each will land. Bare, list the live claims',
    { project: true },
  )
    .argument(
      '[frame-refs...]',
      'the frame to claim, or every frame to release with --release or reserve with --new',
    )
    .option(
      '--release',
      "drop this session's claim on each frame named, or every claim it holds",
    )
    .option(
      '--new',
      'reserve each frame named, none of which may exist yet, as one set that renews together',
    )
    .addOption(
      new Option(
        '--size <preset>',
        'with --new, a size preset or device for every frame',
      ).choices(FRAME_SIZE_NAMES),
    )
    .option('--width <n>', 'with --new, width in px', parseInteger(1))
    .option('--height <n>', 'with --new, height in px', parseInteger(1))
    .option(
      '--x <n>',
      'with --new, board x of the first frame in px',
      ANY_INTEGER,
    )
    .option('--y <n>', 'with --new, board y of the row in px', ANY_INTEGER)
    .option(
      '--session <id>',
      `the session holding the claim, defaulting to ${SESSION_ENV}`,
    )
    .option(
      '--agent <name>',
      'the agent the board names, by its first letter',
      DEFAULT_AGENT,
    )

  act<EditingOptions>(command, context, async (refs, options) => {
    const root = await boardOf(options, io)
    const now = new Date()

    if (options.new) {
      const session = sessionOf(options.session)
      const claims = await reserve(
        root,
        {
          session,
          agent: options.agent,
          tag: tagFor(options.agent, session, io.cwd),
        },
        await reservationsOf(root, refs, options, io.cwd, now),
        now,
      )
      return {
        data: { claims },
        human: `Reserved ${claims.map((each) => each.frame).join(', ')}. Claim any of them again within five minutes to keep the set.`,
      }
    }

    if (options.release) {
      const session = sessionOf(options.session)
      const frames = await targetsOf(root, refs, options, io.cwd)
      await assertClaimable(root, refs, frames, now)
      const released = await release(
        root,
        session,
        refs.length > 0 ? frames.map(refOf) : undefined,
        now,
      )
      return {
        data: { released },
        human:
          released.length === 0
            ? `${session} held no claim to release`
            : `Released ${released.map((each) => each.frame).join(', ')}`,
      }
    }

    if (refs.length > 1) {
      throw new FrameboardError(
        'usage',
        `editing claims one frame at a time. Pass --new to reserve ${refs.length} frames not written yet, or --release to drop ${refs.length} claims.`,
        { refs },
      )
    }

    const [ref] = refs
    if (ref) {
      const session = sessionOf(options.session)
      const target = await targetOf(root, ref, options, io.cwd)
      await assertClaimable(root, refs, [target], now)
      const frame = refOf(target)
      const held = await claim(
        root,
        {
          frame,
          session,
          agent: options.agent,
          tag: tagFor(options.agent, session, io.cwd),
        },
        now,
      )
      return {
        data: { claim: held },
        human: `Editing ${frame} until ${held.expiresAt}. Claim it again within five minutes to keep it.`,
      }
    }

    const claims = await readClaims(root, now)
    return { data: { claims }, human: describe(claims, now) }
  })
}

/** The frame a ref names, whether or not its file is written. */
function targetOf(
  root: string,
  ref: string,
  options: EditingOptions,
  cwd: string,
): Promise<ResolvedRef> {
  return resolveFrameRef(root, ref, {
    project: options.project,
    cwd,
    allowMissing: true,
  })
}

function targetsOf(
  root: string,
  refs: string[],
  options: EditingOptions,
  cwd: string,
): Promise<ResolvedRef[]> {
  return Promise.all(refs.map((ref) => targetOf(root, ref, options, cwd)))
}

/**
 * Refuses the whole call as `frame-not-found`, naming every frame with no
 * file and no live reservation, which an agent claims as it turns to draw it.
 */
async function assertClaimable(
  root: string,
  refs: string[],
  frames: ResolvedRef[],
  now: Date,
): Promise<void> {
  const unwritten = frames.filter((frame) => !existsSync(frame.path))
  const live = unwritten.length > 0 ? await readClaims(root, now) : []
  const reserved = new Set(
    live.filter((each) => each.box).map((each) => each.frame),
  )
  const missing = unwritten.filter((frame) => !reserved.has(refOf(frame)))
  const [first] = missing
  if (!first) return
  if (refs.length === 1) {
    throw new FrameboardError(
      'frame-not-found',
      `No frame ${first.name} in ${first.project}/${first.page}.`,
      { ref: refs[0] },
    )
  }
  const named = missing.map(refOf)
  throw new FrameboardError(
    'frame-not-found',
    `No frame or reservation ${named.join(', ')}, so nothing was released.`,
    { refs: named },
  )
}

/** `<project>/<page>/<frame>`, the one form a claim names a frame by. */
function refOf(frame: ResolvedRef): string {
  return `${frame.project}/${frame.page}/${frame.name}`
}

/**
 * Each named frame's box, one row per page past every frame and reservation,
 * refusing `name-taken` before anything is reserved.
 */
async function reservationsOf(
  root: string,
  refs: string[],
  options: EditingOptions,
  cwd: string,
  now: Date,
): Promise<Reservation[]> {
  if (refs.length === 0) {
    throw new FrameboardError(
      'usage',
      'Name at least one frame to reserve with --new.',
    )
  }
  const frames = await targetsOf(root, refs, options, cwd)
  const existing = frames.filter((frame) => existsSync(frame.path))
  if (existing.length > 0) {
    throw new FrameboardError(
      'name-taken',
      `${existing.map(refOf).join(', ')} already exists, so claim it with editing <ref> rather than reserving it.`,
      { refs: existing.map(refOf) },
    )
  }
  const named = frames.map(refOf)
  const repeated = named.find((ref, index) => named.indexOf(ref) !== index)
  if (repeated) {
    throw new FrameboardError('usage', `${repeated} is named twice.`, {
      ref: repeated,
    })
  }

  const size = { ...FRAME_SIZES[DEFAULT_FRAME_SIZE], ...sizeOf(options) }
  const hugs = hugsOf(options)
  const live = await readClaims(root, now)
  const nextX = new Map<string, number>()
  const reservations: Reservation[] = []
  for (const frame of frames) {
    const page = `${frame.project}/${frame.page}`
    const x = nextX.get(page) ?? options.x ?? (await rightOf(root, frame, live))
    nextX.set(page, x + size.width + FRAME_GAP)
    reservations.push({
      frame: refOf(frame),
      box: { x, y: options.y ?? 0, ...size, ...hugs },
    })
  }
  return reservations
}

/** Where a new row starts on a frame's page, past its frames' drawn rows and reserved boxes. */
async function rightOf(
  root: string,
  frame: ResolvedRef,
  live: Claim[],
): Promise<number> {
  const page = await scanPage(root, frame.project, frame.page, 0)
  const prefix = `${frame.project}/${frame.page}/`
  const boxes: Box[] = [
    ...page.frames.map((each) => drawnExtent(each.box, each.widths, each)),
    ...live.flatMap((each) =>
      each.box && each.frame.startsWith(prefix) ? [each.box] : [],
    ),
  ]
  return Math.max(...boxes.map((box) => box.x + box.width + FRAME_GAP), 0)
}

function describe(claims: Claim[], now: Date): string {
  if (claims.length === 0) return 'No frame is claimed'
  return claims
    .map((each) => {
      const seconds = Math.round(
        (now.getTime() - Date.parse(each.claimedAt)) / 1000,
      )
      const state = each.box ? 'reserved' : 'editing'
      return `${each.frame}  ${each.tag}  ${state} ${seconds}s  ${each.session}`
    })
    .join('\n')
}
