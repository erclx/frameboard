import { toast } from '@/client/components/ui/toast'
import { type LiveStore, liveStore } from '@/client/live/store'
import { type Structure, structure } from '@/client/live/structure'
import { BoardWriteError, writeBoard } from '@/client/live/write'
import { assetKind, isPlaceableKind } from '@/shared/asset-kinds'
import { pageBox } from '@/shared/frame-device'
import { elementFrameName, NAME_MAX_LENGTH, nextFreeName } from '@/shared/names'
import type {
  ExtractResult,
  InsertResult,
  MoveResult,
  PlaceResult,
  RemoveResult,
  WrapResult,
} from '@/shared/records/edit'
import type { ElementTree } from '@/shared/records/elements'
import type { FrameRecord } from '@/shared/records/list'

import { assetUrl } from '../assets/describe'
import type { DraggedResult, PlaceableFile } from '../assets/drag'
import { saveResult } from '../assets/sourcing'
import { WaitDropped, whenFree } from '../claims/waiting'
import { catchUpTree, fetchTree, treeOf } from '../element/tree'
import { siblingGap } from '../element/walk'
import type { Box } from '../geometry/box'
import { inFrameTurn, type Landed, sentence } from '../inspector/element/write'
import { reportRefusal } from '../left-panel/page-actions'
import { type ModeStore, modeStore } from '../mode'
import type { BoardPoint } from '../notes/pick'
import {
  awaitHash,
  type ElementKey,
  rememberHash,
  select,
  selectedElements,
  selectElement,
  selectElements,
  type SelectionStore,
  selectionStore,
} from '../selection'
import { canvasView } from '../view'
import type { DropGhost } from './asset-drop'
import {
  type AssetSize,
  fitFromPointer,
  naturalSize,
  placedSize,
} from './asset-size'
import type { FlowGuess } from './flow-guess'
import { type FrameGap, gapUnder, moveGapUnder } from './gap'
import { placesFree } from './tool'

/** What a placement tool writes, as `POST /api/frames/insert` names it. */
export type PlacedKind = 'text' | 'rectangle' | 'ellipse' | 'divider' | 'asset'

export interface PlaceDeps {
  selection?: SelectionStore
  mode?: ModeStore
  live?: LiveStore
  send?: typeof fetch
  /** Shows a refusal, the kit's toast by default. */
  notify?: (refusal: { title: string; description: string }) => void
  /**
   * A rectangle's, an ellipse's, or a file's size in CSS pixels as a drag
   * drew it, else the default 100 by 100, or for a file `placedSize`.
   */
  size?: { width: number; height: number }
  /** The file an asset places, with the size it draws at on its own. */
  asset?: { path: string; natural: AssetSize | null }
  /** The top left corner of the box a drag drew, where an element placed out of the flow lands. */
  corner?: BoardPoint
}

/** The side a Rectangle or an Ellipse takes with no drag, as the insert route writes it. */
const SHAPE_SIDE = 100

/**
 * Places one element at the gap under a point in the frame's turn, free where
 * `placesFree` says so. A held frame or an unloaded iframe is refused with
 * nothing sent, since its indices would go stale.
 */
export async function placeElement(
  container: ParentNode,
  page: string,
  frames: readonly FrameRecord[],
  at: BoardPoint,
  kind: PlacedKind,
  {
    selection = selectionStore,
    mode = modeStore,
    live = liveStore,
    send = fetch,
    notify = (refusal) => toast.add({ ...refusal, type: 'warning' }),
    size,
    asset,
    corner,
  }: PlaceDeps = {},
): Promise<ElementKey | null> {
  const under = await gapUnder(container, frames, at)
  if (!under || (kind === 'asset' && !asset)) return null
  const { gap } = under
  const free = kind !== 'divider' && placesFree(gap)
  const point = corner ?? at
  const fit = free && asset && !size ? fitAt(asset.natural, point, under) : null
  const spot = free
    ? {
        ...spotFor(kind, fit?.corner ?? point, under, !corner && !size),
        // The gap chose a free spot on its own, so a parent that cannot take it joins the flow instead.
        orFlow: true,
      }
    : undefined
  const element =
    kind === 'asset' && asset
      ? {
          kind,
          path: asset.path,
          ...(size ?? fit?.size ?? placedSize(asset.natural, gap.room)),
        }
      : kind === 'divider'
        ? { kind, vertical: gap.row }
        : kind === 'text' || !size
          ? { kind }
          : { kind, ...size }
  return writeAtGap(
    under,
    'Nothing placed',
    (from) => ({
      url: '/api/frames/insert',
      body: {
        ref: under.frame.ref,
        hash: from,
        parent: gap.parent,
        before: gap.before,
        element,
        ...(spot ? { at: spot } : {}),
      },
    }),
    (placed) => {
      selectElement(selection, page, placed)
      mode.setState({ tool: 'move' })
    },
    { live, send, notify },
  )
}

/**
 * A file dropped free at `point`, fitted to its container and to the frame
 * past the point, with the board corner it lands at once stepped back from
 * an edge too near to hold it.
 */
export function fitAt(
  natural: AssetSize | null,
  point: BoardPoint,
  { frame, gap }: FrameGap,
): { size: AssetSize; corner: BoardPoint } {
  const page = pageBox(frame.box, frame.device, frame.turn)
  const { size, back } = fitFromPointer(natural, gap.room, {
    x: page.x + page.width - point.x,
    y: page.y + page.height - point.y,
  })
  return { size, corner: { x: point.x - back.x, y: point.y - back.y } }
}

/**
 * Where a free placement lands on the board, a Text at its corner alone,
 * since its size comes from its word, and a shape or file at its box.
 */
export type GhostSpot =
  | { kind: 'text'; x: number; y: number }
  | {
      kind: Exclude<PlacedKind, 'text' | 'divider'>
      x: number
      y: number
      width: number
      height: number
    }

/**
 * The spot a click of the tool placing `kind` lands at under `at`, read as
 * `placeElement` reads it, null where the element joins the flow and the
 * drop line shows the gap instead.
 */
export function ghostFor(
  kind: PlacedKind,
  at: BoardPoint,
  under: FrameGap,
  natural: AssetSize | null = null,
): GhostSpot | null {
  if (kind === 'divider' || !placesFree(under.gap)) return null
  if (kind === 'text') return { kind, x: at.x, y: at.y }
  if (kind === 'asset') {
    const { size, corner } = fitAt(natural, at, under)
    return { kind, ...corner, ...size }
  }
  const half = SHAPE_SIDE / 2
  return {
    kind,
    x: at.x - half,
    y: at.y - half,
    width: SHAPE_SIDE,
    height: SHAPE_SIDE,
  }
}

/**
 * The `left` and `top` an element placed out of the flow at `point` takes,
 * against the box the gap's container anchors it to. A clicked shape centers
 * on the point, so it sits under the pointer.
 */
function spotFor(
  kind: PlacedKind,
  point: BoardPoint,
  { frame, gap }: FrameGap,
  clicked: boolean,
): { left: number; top: number } {
  const centered = clicked && (kind === 'rectangle' || kind === 'ellipse')
  const inset = centered ? SHAPE_SIDE / 2 : 0
  const round = (value: number) => Math.round(value * 100) / 100
  const page = pageBox(frame.box, frame.device, frame.turn)
  return {
    left: round(point.x - page.x - gap.origin.x - inset),
    top: round(point.y - page.y - gap.origin.y - inset),
  }
}

/**
 * Places `file` under a board point as `placeElement` places an asset, at
 * the size a drag drew, else at its natural size read first, capped at its
 * container's width and, placed free, at the frame past the point.
 */
export async function placeFile(
  container: ParentNode,
  page: string,
  frames: readonly FrameRecord[],
  at: BoardPoint,
  file: PlaceableFile,
  {
    measure = naturalSize,
    ...deps
  }: PlaceDeps & {
    /** Reads a file's natural size, from the server in the app. */
    measure?: typeof naturalSize
  } = {},
): Promise<ElementKey | null> {
  const natural = deps.size
    ? null
    : await measure(assetUrl(file.project, file.path), file.kind)
  return placeElement(container, page, frames, at, 'asset', {
    ...deps,
    asset: { path: file.path, natural },
  })
}

/**
 * Saves a dropped found result through the save Save sends, then hands the
 * landed file to `place` as a tile's drop would. A refused save places nothing.
 */
export async function placeResult(
  dropped: DraggedResult,
  place: (file: PlaceableFile) => Promise<unknown>,
  { save = saveResult }: { save?: typeof saveResult } = {},
): Promise<void> {
  let path: string
  try {
    path = (await save(dropped.request)).path
  } catch (error) {
    reportRefusal(
      dropped.request.kind === 'model'
        ? "Couldn't save the model"
        : "Couldn't save the image",
    )(error)
    return
  }
  const kind = assetKind(path)
  if (!isPlaceableKind(kind)) return
  await place({ project: dropped.request.project, path, kind })
}

/** A new frame's name stem when a file's own gives none. */
const FILE_FRAME_NAME = 'frame'

/** Leaves room under the name limit for the suffix a taken name grows. */
const FILE_FRAME_STEM = NAME_MAX_LENGTH - 8

/**
 * The name a frame made for the file at `path` asks for: the file's stem
 * with each run of characters a name cannot hold turned to one dash, opening
 * on a letter or digit, else `frame`.
 */
export function fileFrameName(path: string): string {
  const file = path.split('/').at(-1) ?? path
  const stem = file.includes('.') ? file.slice(0, file.lastIndexOf('.')) : file
  const name = stem
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[^A-Za-z0-9]+/, '')
    .slice(0, FILE_FRAME_STEM)
    .replace(/-+$/, '')
  return name === '' ? FILE_FRAME_NAME : name
}

/**
 * The box a frame made for a file takes around a board point: the file's
 * size as `placedSize` reads it with no container to cap it, centered on the
 * point, so a wide video does not land almost wholly off screen.
 */
export function fileFrameBox(natural: AssetSize | null, at: BoardPoint): Box {
  const size = placedSize(natural, 0)
  return {
    x: Math.round(at.x - size.width / 2),
    y: Math.round(at.y - size.height / 2),
    ...size,
  }
}

/**
 * Adds a frame the file's size around a point, holding the file, in one write
 * and one undo step, an audio's frame hugging its player's height.
 */
export async function placeFileFrame(
  page: string,
  frames: readonly FrameRecord[],
  at: BoardPoint,
  file: PlaceableFile,
  {
    measure = naturalSize,
    selection = selectionStore,
    calls = structure,
  }: {
    /** Reads a file's natural size, from the server in the app. */
    measure?: typeof naturalSize
    selection?: SelectionStore
    calls?: Pick<Structure, 'addFrame'>
  } = {},
): Promise<FrameRecord | null> {
  const natural = await measure(assetUrl(file.project, file.path), file.kind)
  const { x, y, width, height } = fileFrameBox(natural, at)
  const name = nextFreeName(
    fileFrameName(file.path),
    frames.map((frame) => frame.name),
  )
  try {
    const added = await calls.addFrame(
      `${page}/${name}`,
      file.kind === 'audio' ? { width } : { width, height },
      x,
      y,
      file.path,
    )
    select(selection, page, [added.ref])
    return added
  } catch (error) {
    reportRefusal("Couldn't add a frame")(error)
    return null
  }
}

/**
 * Lands a file in a frame of its own at the center of the view, the landing
 * a drop on bare canvas makes, doing nothing while no canvas is mounted.
 */
export function placeAtCenter(
  file: PlaceableFile,
  {
    view = canvasView,
    live = liveStore,
  }: { view?: typeof canvasView; live?: LiveStore } = {},
): void {
  const page = view.page()
  const visible = view.visible()
  if (page === null || visible === null) return
  const frames =
    live
      .getState()
      .board?.projects.flatMap((project) => project.pages)
      .find((record) => record.ref === page)?.frames ?? []
  const at = {
    x: visible.x + visible.width / 2,
    y: visible.y + visible.height / 2,
  }
  void placeFileFrame(page, frames, at, file)
}

/**
 * Moves the selected element to the gap under a point in its own frame, in the
 * frame's turn, sending nothing where the move would change nothing or the
 * frame is held.
 */
export async function moveElement(
  container: ParentNode,
  page: string,
  frames: readonly FrameRecord[],
  at: BoardPoint,
  key: ElementKey,
  {
    selection = selectionStore,
    live = liveStore,
    send = fetch,
    notify = (refusal) => toast.add({ ...refusal, type: 'warning' }),
  }: Omit<PlaceDeps, 'mode' | 'size'> = {},
): Promise<ElementKey | null> {
  const under = await moveGapUnder(container, frames, at, key)
  if (!under) return null
  return writeAtGap(
    under,
    'Nothing moved',
    (from) => ({
      url: '/api/frames/move',
      body: {
        ref: key.frame,
        hash: from,
        index: key.index,
        parent: under.gap.parent,
        before: under.gap.before,
      },
    }),
    (moved) => selectElement(selection, page, moved),
    { live, send, notify },
  )
}

/**
 * The frame a release makes of an element drawn at `box`, named as the server
 * names it, with no name while the tree held is of other bytes.
 */
export function elementGhost(
  { frame, index, hash }: ElementKey,
  box: Box,
  frames: readonly FrameRecord[],
  tree: ElementTree | null = treeOf(frame),
): DropGhost {
  const row =
    tree?.hash === hash
      ? tree.elements.find((element) => element.index === index)
      : undefined
  return {
    box: {
      x: Math.round(box.x),
      y: Math.round(box.y),
      width: Math.max(1, Math.round(box.width)),
      height: Math.max(1, Math.round(box.height)),
    },
    name: row
      ? nextFreeName(
          elementFrameName(row.named ? row.name : null, row.tag),
          frames.map(({ name }) => name),
        )
      : null,
    hugging: 'both',
  }
}

/**
 * Moves the selected element out of its frame into a hugging frame of its own
 * at `box`, in the frame's turn, then selects that frame. Answers its ref, or
 * null with nothing sent while the source frame is held.
 */
export async function extractElement(
  page: string,
  key: ElementKey,
  box: Box,
  {
    selection = selectionStore,
    live = liveStore,
    send = fetch,
    notify = (refusal) => toast.add({ ...refusal, type: 'warning' }),
  }: Omit<PlaceDeps, 'mode' | 'size'> = {},
): Promise<string | null> {
  const answer = await writeShifting<ExtractResult>(
    key.frame,
    key.hash,
    'Nothing moved',
    (from) => ({
      url: '/api/frames/extract',
      body: { ref: key.frame, hash: from, index: key.index, box },
    }),
    ({ frame }) => select(selection, page, [frame]),
    { live, send, notify },
  )
  return answer?.frame ?? null
}

/**
 * Moves an element among its siblings. The gap is read in the frame's turn, so
 * a move queued behind another goes from the index and hash that one answered
 * rather than from the tree the press saw.
 */
export async function moveElementTo(
  page: string,
  key: ElementKey,
  to: (place: number, count: number) => number,
  {
    selection = selectionStore,
    live = liveStore,
    send = fetch,
    notify = (refusal) => toast.add({ ...refusal, type: 'warning' }),
    tree = treeAtHash,
  }: Omit<PlaceDeps, 'mode' | 'size'> & {
    /** The frame's tree at a hash, null when it no longer holds those bytes. */
    tree?: (ref: string, hash: string) => Promise<ElementTree | null>
  } = {},
): Promise<ElementKey | null> {
  const ref = key.frame
  const holder = live.getState().claims[ref]
  if (holder) {
    notify({
      title: 'Nothing moved',
      description: `${holder.tag} is editing ${ref.split('/').at(-1) ?? ref}, so nothing was written.`,
    })
    return null
  }

  let landed: ElementKey | null = null
  await inFrameTurn(ref, async (prior): Promise<Landed> => {
    const before = prior ? await prior : undefined
    if (before === null) return null
    // Follows a move ahead, while any other shift leaves its own hash to be refused.
    const follows = before !== undefined && before.from.includes(key.hash)
    const moved = follows
      ? (before.moves?.get(slot(key.hash, key.index)) ??
        before.at.get(key.index))
      : undefined
    const rebased = follows && (!before.shifted || moved !== undefined)
    const from = rebased ? before.to : key.hash
    const index = rebased ? (moved ?? key.index) : key.index
    const held = await tree(ref, from)
    if (!held) {
      notify({
        title: 'Nothing moved',
        description:
          'The frame changed since it was read, so nothing was written.',
      })
      return null
    }
    const gap = siblingGap(held.elements, index, to)
    // Nothing written keeps every index, so a write behind goes as it would have.
    if (!gap) {
      return before ?? { from: [from], to: from, at: new Map(), shifted: false }
    }
    const done = awaitHash(ref)
    rememberHash(ref, from)
    try {
      const answer = await writeBoard<MoveResult>(
        '/api/frames/move',
        { ref, hash: from, index, parent: gap.parent, before: gap.before },
        'POST',
        send,
      )
      rememberHash(ref, answer.hash)
      void catchUpTree(ref, answer.hash)
      landed = { frame: ref, index: answer.index, hash: answer.hash }
      selectElement(selection, page, landed)
      const at = new Map(follows ? before.at : [])
      at.set(key.index, answer.index)
      // Only this element's addresses carry forward, since every other index shifted.
      const moves = new Map<string, number>()
      for (const [address, now] of (follows && before.moves) || []) {
        if (now === index) moves.set(address, answer.index)
      }
      moves.set(slot(key.hash, key.index), answer.index)
      moves.set(slot(from, index), answer.index)
      return {
        from: follows ? [...before.from, from] : [from],
        to: answer.hash,
        at,
        shifted: true,
        moves,
      }
    } catch (error) {
      // The edit ahead stays in the file, so only the element itself stayed.
      notify({
        title: 'Nothing moved',
        description: `${
          error instanceof BoardWriteError
            ? sentence(error.message)
            : 'The board could not be reached, so nothing was written.'
        } The element stays where it was.`,
      })
      return null
    } finally {
      done()
    }
  })
  return landed
}

/** The key a sibling move's trace files an element under, by the bytes and index it was addressed at. */
function slot(hash: string, index: number): string {
  return `${hash}\n${index}`
}

/** A frame's tree at the bytes `hash` names, the held one when it agrees, else read again. */
async function treeAtHash(
  ref: string,
  hash: string,
): Promise<ElementTree | null> {
  const held = treeOf(ref)
  if (held?.hash === hash) return held
  const read = await fetchTree(ref).catch(() => null)
  return read?.hash === hash ? read : null
}

/** Sends a gap's write as `writeShifting` does, landing on the element it answers. */
async function writeAtGap(
  { frame: { ref }, hash }: FrameGap,
  title: string,
  request: (from: string) => { url: string; body: unknown },
  land: (key: ElementKey) => void,
  deps: Required<Pick<PlaceDeps, 'live' | 'send' | 'notify'>>,
): Promise<ElementKey | null> {
  const keyOf = ({ index, hash }: InsertResult | MoveResult) => ({
    frame: ref,
    index,
    hash,
  })
  const answer = await writeShifting<InsertResult | MoveResult>(
    ref,
    hash,
    title,
    request,
    (written) => land(keyOf(written)),
    deps,
  )
  return answer && keyOf(answer)
}

/**
 * Sends a write that shifts a frame's indices, in the frame's turn and from the
 * hash the edit ahead answered, refusing a held frame, whose indices go stale
 * when it writes.
 */
async function writeShifting<T extends { hash: string }>(
  ref: string,
  hash: string,
  title: string,
  request: (from: string) => { url: string; body: unknown },
  land: (answer: T) => void,
  { live, send, notify }: Required<Pick<PlaceDeps, 'live' | 'send' | 'notify'>>,
): Promise<T | null> {
  const holder = live.getState().claims[ref]
  if (holder) {
    notify({
      title,
      description: `${holder.tag} is editing ${ref.split('/').at(-1) ?? ref}, so nothing was written.`,
    })
    return null
  }

  let landed: T | null = null
  await inFrameTurn(ref, async (prior): Promise<Landed> => {
    const before = prior ? await prior : undefined
    if (before === null) return null
    // Rebases only past an in-place edit, since one past an agent's write may shift.
    const rebased =
      before !== undefined && before.from.includes(hash) && !before.shifted
    const from = rebased ? before.to : hash
    const done = awaitHash(ref)
    rememberHash(ref, from)
    try {
      const { url, body } = request(from)
      const answer = await writeBoard<T>(url, body, 'POST', send)
      rememberHash(ref, answer.hash)
      void catchUpTree(ref, answer.hash)
      landed = answer
      land(answer)
      // Every index past the gap moved, so no edit queued behind keeps its own.
      return { from: [from], to: answer.hash, at: new Map(), shifted: true }
    } catch (error) {
      notify({
        title,
        description:
          error instanceof BoardWriteError
            ? sentence(error.message)
            : 'The board could not be reached, so nothing was written.',
      })
      return null
    } finally {
      done()
    }
  })
  return landed
}

/**
 * Deletes the selected element and its subtree in the frame's turn, waiting
 * under a claim as an element edit does rather than racing that session.
 */
export function deleteElement(
  page: string,
  key: ElementKey,
  deps: Omit<PlaceDeps, 'mode'> = {},
): Promise<boolean> {
  return deleteElements(page, [key], deps)
}

/**
 * Deletes one element as the board page leaves, sent at once as a request
 * the browser keeps past the page, since the frame's turn and a claim's
 * wait would hold it until the page is gone. A refusal goes unread.
 */
export function deleteOnLeave(key: ElementKey, send: typeof fetch = fetch) {
  void send('/api/frames/remove', {
    method: 'POST',
    keepalive: true,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ref: key.frame, index: key.index, hash: key.hash }),
  }).catch(() => {})
}

/**
 * Deletes these elements of one frame as `deleteElement` does one, as one
 * write and one undo step, refused whole, then selects their frame.
 */
export async function deleteElements(
  page: string,
  keys: readonly ElementKey[],
  {
    selection = selectionStore,
    live = liveStore,
    send = fetch,
    notify = (refusal) => toast.add({ ...refusal, type: 'warning' }),
  }: Omit<PlaceDeps, 'mode'> = {},
): Promise<boolean> {
  const [key] = keys
  if (!key) return false
  const ref = key.frame
  const landed = await inFrameTurn(ref, async (prior): Promise<Landed> => {
    const before = prior ? await prior : undefined
    if (before === null) return null
    // Rebases only past an in-place edit, as a placement's gap does.
    const rebased =
      before !== undefined && before.from.includes(key.hash) && !before.shifted
    const from = rebased ? before.to : key.hash
    let done = () => {}
    try {
      const answer = await whenFree(
        [ref],
        'delete',
        async () => {
          // Held from the send, so a wait of minutes never skips the frame's hash check.
          done = awaitHash(ref)
          rememberHash(ref, from)
          try {
            return await writeBoard<RemoveResult>(
              '/api/frames/remove',
              keys.length === 1
                ? { ref, index: key.index, hash: from }
                : { ref, indexes: keys.map(({ index }) => index), hash: from },
              'POST',
              send,
            )
          } catch (error) {
            done()
            throw error
          }
        },
        { live },
      )
      rememberHash(ref, answer.hash)
      void catchUpTree(ref, answer.hash)
      select(selection, page, [ref])
      return { from: [from], to: answer.hash, at: new Map(), shifted: true }
    } catch (error) {
      if (!(error instanceof WaitDropped)) {
        notify({
          title: 'Nothing deleted',
          description:
            error instanceof BoardWriteError
              ? sentence(error.message)
              : 'The board could not be reached, so nothing was written.',
        })
      }
      return null
    } finally {
      done()
    }
  })
  return landed !== null
}

/** Where a placed element sits, in CSS pixels against the box it counts from, and the size it rendered at. */
export interface FreeSpot {
  left: number
  top: number
  width?: number
  height?: number
}

/** The element's own `width` and `height` as its style attribute states them, empty when unset. */
export interface InlineSize {
  width: string
  height: string
}

/**
 * The sizes each placement in this tab wrote, by frame and index, so back in
 * flow drops one only while the element still holds the value written. A
 * size an agent or a later edit changed is kept, and a reload forgets them.
 */
const sizesWritten = new Map<string, Partial<InlineSize>>()

function sizeSlot({ frame, index }: Pick<ElementKey, 'frame' | 'index'>) {
  return `${frame}\n${index}`
}

/**
 * Places the element free, or back in the flow on null, writing its tag and
 * its static parent's as one step. Back in flow drops each size this tab's
 * placement wrote, and the write keeps every index.
 */
export async function placeFree(
  page: string,
  key: ElementKey,
  spot: FreeSpot | null,
  {
    selection = selectionStore,
    live = liveStore,
    send = fetch,
    notify = (refusal) => toast.add({ ...refusal, type: 'warning' }),
    inline,
  }: Omit<PlaceDeps, 'mode' | 'size'> & {
    /** The element's own sizes as it renders, read back in flow. */
    inline?: InlineSize
  } = {},
): Promise<boolean> {
  const ref = key.frame
  const title = spot ? 'Nothing placed' : 'Nothing moved'
  const written = sizesWritten.get(sizeSlot(key)) ?? {}
  const drop = spot
    ? []
    : (['width', 'height'] as const).filter(
        (axis) =>
          written[axis] !== undefined && inline?.[axis] === written[axis],
      )
  const holder = live.getState().claims[ref]
  if (holder) {
    notify({
      title,
      description: `${holder.tag} is editing ${ref.split('/').at(-1) ?? ref}, so nothing was written.`,
    })
    return false
  }
  const landed = await inFrameTurn(ref, async (prior): Promise<Landed> => {
    const before = prior ? await prior : undefined
    if (before === null) return null
    const rebased =
      before !== undefined && before.from.includes(key.hash) && !before.shifted
    const from = rebased ? before.to : key.hash
    const index = rebased ? (before.at.get(key.index) ?? key.index) : key.index
    const done = awaitHash(ref)
    rememberHash(ref, from)
    try {
      const answer = await writeBoard<PlaceResult>(
        '/api/frames/place',
        { ref, hash: from, index, spot, ...(drop.length > 0 ? { drop } : {}) },
        'POST',
        send,
      )
      rememberHash(ref, answer.hash)
      void catchUpTree(ref, answer.hash)
      selectElement(selection, page, {
        frame: ref,
        index: answer.index,
        hash: answer.hash,
      })
      const slot = sizeSlot({ frame: ref, index: answer.index })
      if (spot) {
        sizesWritten.set(
          slot,
          Object.fromEntries(
            answer.sized.map((axis) => [axis, `${spot[axis] ?? 0}px`]),
          ),
        )
      } else {
        sizesWritten.delete(slot)
      }
      const at = new Map(rebased ? before.at : [])
      at.set(key.index, answer.index)
      return {
        from: rebased ? [...before.from, from] : [from],
        to: answer.hash,
        at,
        shifted: false,
      }
    } catch (error) {
      notify({
        title,
        description:
          error instanceof BoardWriteError
            ? sentence(error.message)
            : 'The board could not be reached, so nothing was written.',
      })
      return null
    } finally {
      done()
    }
  })
  return landed !== null
}

/** One element's placement in a batch: where it goes, null for back in flow, and the sizes its style holds. */
export interface FreePlace {
  key: ElementKey
  spot: FreeSpot | null
  inline?: InlineSize
}

/**
 * Places these elements of one frame as `placeFree` does one, as one write and
 * one undo step, refused whole, keeping every selected element selected at the
 * bytes written. Answers whether it landed.
 */
export async function placeFreeAll(
  page: string,
  places: readonly FreePlace[],
  {
    selection = selectionStore,
    live = liveStore,
    send = fetch,
    notify = (refusal) => toast.add({ ...refusal, type: 'warning' }),
  }: Omit<PlaceDeps, 'mode' | 'size'> = {},
): Promise<boolean> {
  const key = places[0]?.key
  if (!key) return false
  const ref = key.frame
  const title = places.some(({ spot }) => spot)
    ? 'Nothing placed'
    : 'Nothing moved'
  const holder = live.getState().claims[ref]
  if (holder) {
    notify({
      title,
      description: `${holder.tag} is editing ${ref.split('/').at(-1) ?? ref}, so nothing was written.`,
    })
    return false
  }
  const landed = await inFrameTurn(ref, async (prior): Promise<Landed> => {
    const before = prior ? await prior : undefined
    if (before === null) return null
    const rebased =
      before !== undefined && before.from.includes(key.hash) && !before.shifted
    const from = rebased ? before.to : key.hash
    const done = awaitHash(ref)
    rememberHash(ref, from)
    try {
      const sent = places.map(({ key: at, spot, inline }) => {
        const written = sizesWritten.get(sizeSlot(at)) ?? {}
        const drop = spot
          ? []
          : (['width', 'height'] as const).filter(
              (axis) =>
                written[axis] !== undefined && inline?.[axis] === written[axis],
            )
        return {
          index: rebased ? (before.at.get(at.index) ?? at.index) : at.index,
          spot,
          ...(drop.length > 0 ? { drop } : {}),
        }
      })
      const answer = await writeBoard<PlaceResult>(
        '/api/frames/place',
        { ref, hash: from, places: sent },
        'POST',
        send,
      )
      rememberHash(ref, answer.hash)
      void catchUpTree(ref, answer.hash)
      for (const [at, { index, spot }] of sent.entries()) {
        const slot = sizeSlot({ frame: ref, index })
        const sized = answer.placed?.[at]?.sized ?? []
        if (spot) {
          sizesWritten.set(
            slot,
            Object.fromEntries(
              sized.map((axis) => [axis, `${spot[axis] ?? 0}px`]),
            ),
          )
        } else {
          sizesWritten.delete(slot)
        }
      }
      const state = selection.getState()
      if (state.page === page && state.element?.frame === ref) {
        selectElements(
          selection,
          page,
          selectedElements(state).map((held) => ({
            ...held,
            hash: answer.hash,
          })),
        )
      }
      return {
        from: rebased ? [...before.from, from] : [from],
        to: answer.hash,
        at: new Map(rebased ? before.at : []),
        shifted: false,
      }
    } catch (error) {
      notify({
        title,
        description:
          error instanceof BoardWriteError
            ? sentence(error.message)
            : 'The board could not be reached, so nothing was written.',
      })
      return null
    } finally {
      done()
    }
  })
  return landed !== null
}

/** What a wrap sends beyond the elements: the flow, and where the container sits when every one was free. */
export interface WrapRequest {
  flow: FlowGuess
  spot: { left: number; top: number } | null
}

/**
 * Wraps sibling elements in one flow container in the frame's turn. A wrap
 * shifts every index after it, so a queued edit goes from the answered indices
 * for the members and from its own hash otherwise.
 */
export async function wrapSelection(
  page: string,
  keys: readonly ElementKey[],
  { flow, spot }: WrapRequest,
  {
    selection = selectionStore,
    live = liveStore,
    send = fetch,
    notify = (refusal) => toast.add({ ...refusal, type: 'warning' }),
    catchUp = catchUpTree,
  }: Omit<PlaceDeps, 'mode' | 'size'> & {
    /** Brings the frame's element tree up to the bytes the wrap answered, `catchUpTree` by default. */
    catchUp?: (ref: string, hash: string) => Promise<void>
  } = {},
): Promise<boolean> {
  const [key] = keys
  if (!key) return false
  const ref = key.frame
  const holder = live.getState().claims[ref]
  if (holder) {
    notify({
      title: 'Nothing wrapped',
      description: `${holder.tag} is editing ${ref.split('/').at(-1) ?? ref}, so nothing was written.`,
    })
    return false
  }
  const landed = await inFrameTurn(ref, async (prior): Promise<Landed> => {
    const before = prior ? await prior : undefined
    if (before === null) return null
    const follows = before !== undefined && before.from.includes(key.hash)
    const rebased =
      follows &&
      (!before.shifted || keys.every(({ index }) => before.at.has(index)))
    const from = rebased ? before.to : key.hash
    const indexes = keys.map(({ index }) =>
      rebased ? (before.at.get(index) ?? index) : index,
    )
    const done = awaitHash(ref)
    rememberHash(ref, from)
    try {
      const answer = await writeBoard<WrapResult>(
        '/api/frames/wrap',
        { ref, hash: from, indexes, flow, spot },
        'POST',
        send,
      )
      rememberHash(ref, answer.hash)
      if (selection.getState().page === page) {
        selectElement(selection, page, {
          frame: ref,
          index: answer.index,
          hash: answer.hash,
        })
      }
      done()
      // The turn holds until Layers reads the shifted tree, or a failed read leaves it.
      await catchUp(ref, answer.hash).catch(() => {})
      const at = new Map(follows ? before.at : [])
      for (const [place, { index }] of keys.entries()) {
        const now = answer.members[place]
        if (now !== undefined) at.set(index, now)
      }
      return {
        from: follows ? [...before.from, from] : [from],
        to: answer.hash,
        at,
        shifted: true,
      }
    } catch (error) {
      if (!(error instanceof WaitDropped)) {
        notify({
          title: 'Nothing wrapped',
          description:
            error instanceof BoardWriteError
              ? sentence(error.message)
              : 'The board could not be reached, so nothing was written.',
        })
      }
      return null
    } finally {
      done()
    }
  })
  return landed !== null
}
