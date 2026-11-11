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
      'the frame to claim or release, or with --new every frame to reserve',
    )
    .option(
      '--release',
      "drop this session's claim on the frame, or every claim it holds",
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

    if (refs.length > 1) {
      throw new FrameboardError(
        'usage',
        `editing claims one frame at a time. Pass --new to reserve ${refs.length} frames not written yet.`,
        { refs },
      )
    }
    const [ref] = refs

    if (options.release) {
      const session = sessionOf(options.session)
      const frame = ref
        ? await claimable(root, ref, resolving(options, io.cwd), now)
        : undefined
      const released = await release(root, session, frame, now)
      return {
        data: { released },
        human:
          released.length === 0
            ? `${session} held no claim to release`
            : `Released ${released.map((each) => each.frame).join(', ')}`,
      }
    }

    if (ref) {
      const session = sessionOf(options.session)
      const frame = await claimable(root, ref, resolving(options, io.cwd), now)
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

function resolving(options: EditingOptions, cwd: string) {
  return { project: options.project, cwd }
}

/**
 * The ref a plain claim names: an existing frame, or one a live reservation
 * holds before its file is written, which the agent claims as it turns to
 * draw it. Any other missing frame refuses `frame-not-found` as before.
 */
async function claimable(
  root: string,
  ref: string,
  options: { project?: string; cwd: string },
  now: Date,
): Promise<string> {
  const frame = await resolveFrameRef(root, ref, {
    ...options,
    allowMissing: true,
  })
  const canonical = refOf(frame)
  if (existsSync(frame.path)) return canonical
  const reserved = (await readClaims(root, now)).some(
    (each) => each.frame === canonical && each.box,
  )
  if (reserved) return canonical
  throw new FrameboardError(
    'frame-not-found',
    `No frame ${frame.name} in ${frame.project}/${frame.page}.`,
    { ref },
  )
}

/** `<project>/<page>/<frame>`, the one form a claim names a frame by. */
function refOf(frame: ResolvedRef): string {
  return `${frame.project}/${frame.page}/${frame.name}`
}

/**
 * The box each named frame will land in, in one row per page in the order
 * named, past every frame and live reservation already on that page unless
 * `--x` or `--y` sets the row. A frame that exists already refuses
 * `name-taken` before anything is reserved.
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
  const frames = await Promise.all(
    refs.map((ref) =>
      resolveFrameRef(root, ref, {
        ...resolving(options, cwd),
        allowMissing: true,
      }),
    ),
  )
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
    ...page.frames.map((each) => drawnExtent(each.box, each.widths)),
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
