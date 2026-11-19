import { randomUUID } from 'node:crypto'
import { EventEmitter, once } from 'node:events'
import { readFile, stat } from 'node:fs/promises'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join, relative, sep } from 'node:path'

import { serve } from '@hono/node-server'

import type { FrameChange } from '@/shared/records/changes'
import type { Finding } from '@/shared/records/check'
import type { ListResult } from '@/shared/records/list'
import { THEMES } from '@/shared/theme'

import { type Access } from './access/guard'
import { cookieName, loadBoardKey } from './access/key'
import { createTickets } from './access/tickets'
import { createApp, isBoardHost } from './app'
import { createAssetUsage } from './board/asset-usage'
import { FRAME_EXTENSION, scanBoard } from './board/scan'
import { launchCaptureBrowser, type Launcher } from './capture/browser'
import { measureContent } from './capture/fit'
import { createWarmFilmstripRenderer } from './capture/images'
import { createWarmBrowser, createWarmRenderer } from './capture/render'
import { createThumbnailStore, type ThumbnailStore } from './capture/thumbnails'
import { type ChangeTracker, createChangeTracker } from './changes/tracker'
import { checkRendered } from './checks/browser/rendered'
import { readConfig } from './checks/frame'
import { boardPath, frameFrom, readFrame } from './checks/frame-source'
import { checkOutranked } from './checks/outranked'
import { landReserved } from './claims/land'
import { type ClaimsPush, createClaimsPush } from './claims/push'
import { clipboardFiles } from './clipboard/files'
import { contentHash } from './edit/address'
import { History } from './history/stack'
import { emptyTrash } from './history/trash'
import {
  type BoardFindings,
  createBoardFindings,
  recheckRefs,
} from './live/findings'
import { createHub, type LiveHub } from './live/hub'
import {
  createHug,
  type Hug,
  type MeasureFrame,
  ownFileRefs,
  writtenSinceLayout,
} from './live/hug'
import { openBoard } from './live/open-board'
import {
  acrossWidths,
  createRenderedFindings,
  type RenderedFindings,
} from './live/rendered-findings'
import { createSelectionHolder } from './live/selection'
import {
  type BoardWatcher,
  type MovedFolder,
  ownReloadRefs,
  placedRefs,
  rekittedRefs,
  relistedRefs,
  reloadRefs,
  unmovedRefs,
  watchBoard,
} from './live/watch'
import { createDelivery, type Delivery } from './notes/delivery'
import { createDispatcher } from './notes/dispatch'
import {
  boardView,
  markDelivered,
  NOTES_FILE,
  notesPath,
  pageView,
  queuedFor,
} from './notes/store'
import { createPreviewSlot } from './preview/listener'

// Loopback only: the board serves the operator's own files, so it stays off the LAN.
const HOSTNAME = '127.0.0.1'

/**
 * How long a batch's changes wait, so a large hand write reaching a batch
 * before history records the step is withdrawn rather than marked.
 */
const OWN_GRACE_MS = 1000

/**
 * How long a folder the board's own rename moved keeps its unchanged frames
 * from reloading, well past the watcher reporting the move under load.
 */
const MOVED_MS = 10_000

export interface StartOptions {
  clientDir: string
  /** The folder holding the faces every frame imports. */
  facesDir: string
  root: string
  /** The absolute `--tokens` sheet standing in for the board's `tokens.css`, when given. */
  tokens?: string
  port: number
  /** Fail on a taken port rather than falling back to one the OS assigns. */
  strictPort?: boolean
  /** Opens a browser tab, for a second `serve` asking this one to open the board. */
  openUrl: (url: string) => void
  /** Launches the warm browser, the headless shell unless a test stands in. */
  launch?: Launcher
  /** The command a note starts a session with, from `FRAMEBOARD_DISPATCH`, run in `cwd`. */
  dispatch?: { command: string; cwd: string; env: NodeJS.ProcessEnv }
  /** Mounts `GET /api/access/open`, which hands any local browser a writing tab. */
  openRoute?: boolean
}

/**
 * The live board tabs, counting writers apart, since `serve` waits on a
 * writer and a hand-typed tab cannot change the board.
 */
export class BoardTabs {
  #count = 0
  #writers = 0
  readonly #events = new EventEmitter()

  get count(): number {
    return this.#count
  }

  get writers(): number {
    return this.#writers
  }

  open(writer: boolean): void {
    this.#count += 1
    if (writer) {
      this.#writers += 1
      this.#events.emit('writer')
    }
  }

  close(writer: boolean): void {
    this.#count = Math.max(0, this.#count - 1)
    if (writer) this.#writers = Math.max(0, this.#writers - 1)
  }

  /** True once a writing tab is connected, false when none connects within `ms`. */
  async waitForWriter(ms: number): Promise<boolean> {
    if (this.#writers > 0) return true
    try {
      await once(this.#events, 'writer', { signal: AbortSignal.timeout(ms) })
      return true
    } catch {
      return false
    }
  }
}

export interface RunningServer {
  hostname: string
  /** The port actually bound, which differs from the requested one when that was 0 or taken. */
  port: number
  tabs: BoardTabs
  /** The board folder's watcher, whose batches any later check can follow without a second one. */
  watcher: BoardWatcher
  /** Sets the token the write routes accept, once the address file records it. */
  authorize: (token: string) => void
  /** The board's address with a fresh single-use ticket, which a browser trades for the write cookie. */
  boardUrl: () => string
  /** Resolves once every queued turn has finished, and resolves again on a later call. */
  close: () => Promise<void>
}

export async function startServer({
  strictPort = true,
  port,
  ...options
}: StartOptions): Promise<RunningServer> {
  try {
    return await listen({ ...options, port })
  } catch (error) {
    const taken = (error as NodeJS.ErrnoException).code === 'EADDRINUSE'
    if (strictPort || !taken || port === 0) throw error
    return listen({ ...options, port: 0 })
  }
}

async function listen({
  clientDir,
  facesDir,
  root,
  tokens,
  port,
  openUrl,
  launch,
  dispatch,
  openRoute,
}: Omit<StartOptions, 'strictPort'>): Promise<RunningServer> {
  const tabs = new BoardTabs()
  const tickets = createTickets()
  let bound = 0
  let token: string | null = null
  const boundPort = () => bound
  const access: Access = {
    token: () => token,
    key: await loadBoardKey(root),
    cookieName: cookieName(root),
    isOwnOrigin: (host) => isBoardHost(host, bound),
  }
  const boardUrl = () =>
    `http://${HOSTNAME}:${bound}/api/access/redeem?ticket=${tickets.mint().ticket}`
  // One scan at a time, so a slow scan never sends an older board.
  let scanning: Promise<unknown> = Promise.resolve()
  const inTurn = <T>(task: () => Promise<T>): Promise<T> => {
    const run = scanning.then(task)
    scanning = run.catch(() => {})
    return run
  }
  let closing: Promise<void> | undefined
  const findings = createBoardFindings(root, tokens ?? null)
  const delivery = createDelivery({
    pending: (session) => queuedFor(root, session),
    markDelivered: (id, session) =>
      markDelivered(root, id, session, new Date()),
    onListeners: (listeners) => hub.broadcast({ type: 'listeners', listeners }),
    now: () => new Date(),
  })
  const dispatcher = dispatch
    ? createDispatcher({ ...dispatch, root })
    : undefined
  // The history lives in memory, so a trash a previous server left holds nothing it can undo.
  await emptyTrash(root)
  const tracker = createChangeTracker(root)
  // A log that fails to save costs the next start its marks, never this one its changes.
  const saveLog = () => tracker.save().catch(() => {})
  const settling = new Map<ReturnType<typeof setTimeout>, () => void>()
  // The bytes each frame's held `outranked` warning was raised against.
  const raised = new Map<string, string>()
  // The grace each frame's latest agent write waits out, which `check` waits on.
  const graces = new Map<string, Promise<void>>()
  const settleLater = (held: FrameChange[]) => {
    let release = () => {}
    const done = new Promise<void>((resolve) => {
      release = resolve
    })
    for (const change of held) graces.set(change.frame, done)
    const timer = setTimeout(() => {
      settling.delete(timer)
      void inTurn(async () => {
        const changes = tracker.settle(held)
        if (changes.length > 0) {
          hub.broadcast({ type: 'changes', changes })
          await saveLog()
        }
        const sent = changeFindings(root, changes, tracker, findings, raised)
        if (Object.keys(sent).length > 0) {
          hub.broadcast({ type: 'findings', findings: sent })
        }
      }).finally(() => {
        for (const change of held) {
          if (graces.get(change.frame) === done) graces.delete(change.frame)
        }
        release()
      })
    }, OWN_GRACE_MS)
    settling.set(timer, release)
  }
  // The board the tabs last received, which a moved frame's stamp is read against.
  const shown: { board: ListResult | null } = { board: null }
  // Not `shown`, since a tab's snapshot can scan a placement before its batch.
  const scanned: ScannedBoard = { board: null, unmeasured: [] }
  let moved: MovedFolder[] = []
  const recentlyMoved = () => {
    moved = moved.filter(({ at }) => Date.now() - at < MOVED_MS)
    return moved
  }
  // The board's own write rereads its frames in turn, so its batch reads as nothing new.
  const history = new History(
    root,
    (counts) => hub.broadcast({ type: 'history', ...counts }),
    (step, side) => {
      if (step.renamed) {
        for (const change of step.changes) {
          if (change.kind !== 'moved') continue
          moved = [
            ...recentlyMoved(),
            {
              from: side === 'after' ? change.from : change.to,
              path: side === 'after' ? change.to : change.from,
              at: Date.now(),
            },
          ]
        }
        const from = side === 'after' ? 'before' : 'after'
        hub.broadcast({
          type: 'renamed',
          before: step.renamed[from],
          after: step.renamed[side],
        })
      }
      void inTurn(() => tracker.own(step))
    },
  )
  const selection = createSelectionHolder(() => tabs.writers)
  const hub = createHub({
    tabs,
    port: boundPort,
    access,
    snapshot: () =>
      inTurn(async () => {
        shown.board = await scanBoard(root)
        return shown.board
      }),
    findings: () => inTurn(async () => findings.all()),
    notes: () => inTurn(() => boardView(root)),
    delivery,
    history: () => history.counts(),
    claims: () => inTurn(() => claims.read()),
    changes: () => inTurn(async () => tracker.log()),
    closeTab: selection.closeTab,
    dispatch: dispatcher !== undefined,
  })
  const claims = createClaimsPush(root, {
    broadcast: (list) => hub.broadcast({ type: 'claims', claims: list }),
    inTurn,
  })
  // One browser for every renderer, each on its own queue.
  const browser = createWarmBrowser(() =>
    launchCaptureBrowser({
      purpose: 'Board PNGs, thumbnails, and browser checks',
      launch,
    }),
  )
  const baseUrl = () => `http://${HOSTNAME}:${bound}`
  const renderFrame = createWarmRenderer({ baseUrl, browser, scale: 2 })
  const renderFilmstrip = createWarmFilmstripRenderer({ baseUrl, browser })
  const thumbnails = createThumbnailStore({
    root,
    run: randomUUID().slice(0, 8),
    render: createWarmRenderer({ baseUrl, browser, scale: 0.5 }),
    onRendered: (theme, stamps) =>
      hub.broadcast({ type: 'thumbnails', theme, stamps }),
  })
  // Captures a previous server left could show a frame edited while none ran.
  await thumbnails.empty()
  const rendered = createRenderedFindings({
    check: async (frame) => {
      const list = await acrossWidths(frame, async (box) =>
        checkRendered(await browser.get(), {
          baseUrl: baseUrl(),
          root,
          frame: {
            ref: frame.ref,
            path: boardPath(root, frame.path),
            box,
            scroll: frame.scroll,
            hugHeight: frame.hugHeight,
            // A linked width draws no device, so only the frame's own box has a page under a bar.
            device: box.width === frame.box.width ? frame.device : undefined,
          },
          config: readConfig(root, frame.project),
        }),
      )
      if (list === null) return null
      // Left to a newer write's batch, since this read used the old box.
      return (await modifiedAt(frame.path)) === frame.modifiedAt ? list : null
    },
    onResult: (ref, list) => {
      const before = findings.rendered([ref])[ref]
      if (JSON.stringify(before) === JSON.stringify(list)) return
      const changed = findings.setRendered(ref, list)
      if (Object.keys(changed).length > 0) {
        hub.broadcast({ type: 'findings', findings: changed })
      }
    },
  })
  const measure: MeasureFrame = async (frame, box) =>
    measureContent(await browser.get(), {
      baseUrl: baseUrl(),
      ref: frame.ref,
      box: box ?? frame.box,
      hugWidth: box === undefined && frame.hugWidth,
      fonts: 'wait',
    })
  const hug = createHug({ root, measure })
  const assetUsage = createAssetUsage(root)
  const preview = createPreviewSlot({ root, facesDir, tokens })
  const app = createApp({
    clientDir,
    facesDir,
    tokens,
    root,
    port: boundPort,
    tickets,
    openRoute,
    delivery,
    dispatch: dispatcher,
    history,
    selection,
    renderFrame,
    renderFilmstrip,
    clipboard: clipboardFiles(),
    preview,
    thumbnails,
    measure,
    frameVersion: tracker.version,
    // Waits its turn behind a batch still logging the agent's write.
    settledVersion: (ref, hash) =>
      inTurn(async () => tracker.version(ref, hash)),
    assetUsage,
    checks: {
      refresh: (refs) =>
        inTurn(async () => {
          try {
            const board = await scanBoard(root)
            rendered.queue(board, [])
            // Takes in an unbatched agent write, so its findings land before the answer.
            const held = await tracker.update(
              board,
              refs.map(
                (ref) => join(root, ...ref.split('/')) + FRAME_EXTENSION,
              ),
              await claims.read(),
            )
            if (held.length > 0) settleLater(held)
          } catch {
            // A board folder mid-removal does not scan, and the batch catches up.
          }
        }),
      settle: async (refs) => {
        await Promise.all(refs.map((ref) => graces.get(ref)))
        await rendered.settle(refs)
      },
      rendered: findings.rendered,
      changed: findings.changed,
      unavailable: rendered.unavailable,
    },
    actions: {
      access,
      // A running server's tabs have long since reconnected, so it waits for none.
      open: () =>
        openBoard({
          tabs,
          url: boardUrl,
          open: openUrl,
          graceMs: 0,
        }),
      // In the scan turn, the log's one writer, so tabs hear marks before the jump.
      show: (refs, author) =>
        inTurn(async () => {
          const changes = tracker.show(refs, author)
          if (changes.length > 0) {
            hub.broadcast({ type: 'changes', changes })
            await saveLog()
          }
          hub.broadcast({ type: 'show', ref: refs[0] ?? '' })
          return tabs.count
        }),
    },
  })

  const server = await new Promise<Server>((resolve, reject) => {
    const created = serve(
      { fetch: app.fetch, hostname: HOSTNAME, port },
      (info: AddressInfo) => {
        bound = info.port
        resolve(created as Server)
      },
    )
    created.once('error', reject)
  })
  server.on('upgrade', hub.handleUpgrade)

  // Checked once at start, ahead of any hello's findings.
  const sweep = inTurn(async () => {
    // A reserved frame written while no server ran lands in its box first.
    await landReserved(root, new Date()).catch(() => [])
    const board = await scanBoard(root)
    const stale = await writtenSinceLayout(board).catch((): string[] => [])
    scanned.board = board
    await tracker.prime(board)
    findings.update(board, 'all')
    // A stale frame's box moves with its measure, so the checks wait on it.
    if (stale.length === 0) rendered.queue(board, [])
    hug.later(
      board,
      frameRefs(board).filter((ref) => !stale.includes(ref)),
    )
    return { board, stale }
  })
  // Measured outside the turn, so a hello hears the stored sizes meanwhile.
  const measuredAtStart = sweep
    .then(async ({ board, stale }) => {
      if (stale.length === 0) return
      const trails = await hug.now(board, stale).catch(() => false)
      await inTurn(async () => {
        if (closing) return
        let latest = scanned.board ?? board
        if (trails) {
          latest = await scanBoard(root)
          // Measures nothing it finds newly placed, so those wait for the batch naming their layout.
          scanned.unmeasured = placedRefs(
            scanned.board ?? board,
            latest,
            undefined,
            scanned.unmeasured,
          )
          scanned.board = latest
          hub.broadcast({ type: 'board', data: latest })
          shown.board = latest
          const changed = findings.update(
            latest,
            framePaths(latest)
              .filter(([ref]) => stale.includes(ref))
              .map(([, path]) => path),
          )
          if (Object.keys(changed).length > 0) {
            hub.broadcast({ type: 'findings', findings: changed })
          }
        }
        rendered.queue(latest, [])
      })
    })
    .catch(() => {})
  // A claims file left by an earlier server arms the expiry from what it holds.
  void claims.push()
  const watcher = await watchBoard(root, tokens ? [tokens] : [])
  watcher.onBatch(assetUsage.drop)
  watcher.onBatch((paths) => {
    // A claim or a renewal sends the claims alone, never a rescan or a check.
    const rest = paths.filter((path) => path !== claims.path)
    if (rest.length < paths.length) void claims.push()
    if (rest.length === 0) return
    void inTurn(() =>
      pushBatch(root, tokens ?? null, rest, {
        hub,
        findings,
        rendered,
        delivery,
        tracker,
        claims,
        thumbnails,
        hug,
        settleLater,
        moved: recentlyMoved,
        shown,
        scanned,
      }),
    )
  })

  return {
    hostname: HOSTNAME,
    port: bound,
    tabs,
    watcher,
    authorize: (next) => {
      token = next
    },
    boardUrl,
    close: () => {
      closing ??= (async () => {
        rendered.close()
        hug.close()
        claims.close()
        for (const [timer, release] of settling) {
          clearTimeout(timer)
          release()
        }
        await Promise.all([
          watcher.close(),
          hub.close(),
          browser.close(),
          emptyTrash(root),
          // No phone link outlives the board that opened it.
          preview.stop(),
        ])
        await new Promise<void>((done, fail) => {
          server.close((error) => (error ? fail(error) : done()))
          // A tab's keep-alive connection would hold close open indefinitely.
          server.closeAllConnections()
        })
        // Its last turn is queued only once the measure ends, so the drain waits on it.
        await measuredAtStart
        // Drains until the tail stops moving, so no turn writes into a removed folder.
        let tail: Promise<unknown>
        do {
          tail = scanning
          await tail
        } while (tail !== scanning)
      })()
      return closing
    },
  }
}

/** The board the last batch scanned, replaced by each batch's first scan. */
interface ScannedBoard {
  board: ListResult | null
  /**
   * Hugging frames `board` holds placed that no batch measured. A batch
   * waiting its turn can scan a placement whose `layout.json` it does not
   * name, and the batch that names it would read the frame as placed already.
   */
  unmeasured: string[]
}

/**
 * One rescan per batch, pushing the board, then reloads, then findings, then
 * notes, an agent's changes waiting out the grace before the board hears.
 */
async function pushBatch(
  root: string,
  tokens: string | null,
  paths: string[],
  {
    hub,
    findings,
    rendered,
    delivery,
    tracker,
    claims,
    thumbnails,
    hug,
    settleLater,
    moved,
    shown,
    scanned,
  }: {
    hub: LiveHub
    findings: BoardFindings
    rendered: RenderedFindings
    delivery: Delivery
    tracker: ChangeTracker
    claims: ClaimsPush
    thumbnails: ThumbnailStore
    hug: Hug
    /** Broadcasts the changes `own` has not withdrawn once the grace passes. */
    settleLater: (held: FrameChange[]) => void
    /** The folders the board's own renames recently moved, whose unchanged frames keep their page. */
    moved: () => readonly MovedFolder[]
    /** The board the tabs last received, replaced by this batch's. */
    shown: { board: ListResult | null }
    scanned: ScannedBoard
  },
): Promise<void> {
  let board
  let own: string[]
  let placed: string[]
  let relisted: string[] = []
  let rekitted: string[] = []
  try {
    // Lands reserved frames first, so the board first sees them in their box.
    await landReserved(root, new Date()).catch(() => [])
    board = await scanBoard(root)
    const { board: previous, unmeasured } = scanned
    own = ownFileRefs(board, paths)
    // Measured here, since a placement changes only `layout.json`.
    placed = previous
      ? placedRefs(previous, board, paths, unmeasured).filter(
          (ref) => !own.includes(ref),
        )
      : []
    const measuring = new Set([...own, ...placed])
    scanned.board = board
    scanned.unmeasured = previous
      ? placedRefs(previous, board, undefined, unmeasured).filter(
          (ref) => !measuring.has(ref),
        )
      : []
    // New linked widths measure after the push, as `hug.now` queues them.
    relisted = previous ? relistedRefs(previous, board) : []
    rekitted = previous ? rekittedRefs(previous, board) : []
    // Measured first, so the board never shows a reloaded frame at its old size.
    if (await hug.now(board, [...own, ...placed]).catch(() => false)) {
      const measured = board
      board = await scanBoard(root)
      scanned.board = board
      // Measures frames placed mid-measure once, since the next batch reads them as placed.
      const late = placedRefs(measured, board)
      if (late.length > 0) {
        placed = [...placed, ...late]
        if (await hug.now(board, late).catch(() => false)) {
          board = await scanBoard(root)
        }
      }
    }
  } catch {
    // A board folder mid-removal does not scan, and the next batch catches up.
    return
  }
  hub.broadcast({ type: 'board', data: board })
  const last = shown.board
  shown.board = board
  const refs = [
    ...new Set([...reloadRefs(root, paths, board, tokens), ...rekitted]),
  ]
  // Measured after the push, since a token change reaches every frame.
  hug.later(
    board,
    [...new Set([...refs, ...relisted])].filter(
      (ref) => !own.includes(ref) && !placed.includes(ref),
    ),
  )
  if (refs.length > 0) {
    const reloads = unmovedRefs(refs, board, moved(), last)
    if (reloads.length > 0) {
      const hashes = await ownFileHashes(
        board,
        ownReloadRefs(root, paths, board, tokens).filter((ref) =>
          reloads.includes(ref),
        ),
      )
      hub.broadcast({
        type: 'reload',
        refs: reloads,
        ...(Object.keys(hashes).length > 0 ? { hashes } : {}),
      })
    }
    thumbnails.invalidate(refs)
    const stale = Object.fromEntries(refs.map((ref) => [ref, null]))
    for (const theme of THEMES) {
      hub.broadcast({ type: 'thumbnails', theme, stamps: stale })
    }
  }
  const held = await tracker.update(board, paths, await claims.read())
  if (held.length > 0) settleLater(held)
  const changed = findings.update(board, paths)
  if (Object.keys(changed).length > 0) {
    hub.broadcast({ type: 'findings', findings: changed })
  }
  rendered.queue(board, recheckRefs(root, paths, board, tokens))
  await pushNotes(root, paths, hub, delivery)
}

function frameRefs(board: ListResult): string[] {
  return framePaths(board).map(([ref]) => ref)
}

function framePaths(board: ListResult): [ref: string, path: string][] {
  return board.projects
    .flatMap((project) => project.pages)
    .flatMap((page) => page.frames)
    .map((frame) => [frame.ref, frame.path])
}

/**
 * The content hash of each named frame's file as it stands now, which is
 * what its reload will render. A file that cannot be read is left out, so
 * its frame reloads.
 */
async function ownFileHashes(
  board: ListResult,
  refs: readonly string[],
): Promise<Record<string, string>> {
  const named = new Set(refs)
  const frames = board.projects
    .flatMap((project) => project.pages)
    .flatMap((page) => page.frames)
    .filter((frame) => named.has(frame.ref))
  const read = await Promise.all(
    frames.map(async (frame) => {
      try {
        return [[frame.ref, contentHash(await readFile(frame.path))] as const]
      } catch {
        return []
      }
    }),
  )
  return Object.fromEntries(read.flat())
}

/**
 * Runs `outranked` over each settled agent write, keeping a warning while it
 * still holds against the bytes that raised it, so a later edit elsewhere never
 * clears it before `check` reports it.
 */
function changeFindings(
  root: string,
  changes: readonly FrameChange[],
  tracker: ChangeTracker,
  findings: BoardFindings,
  raised: Map<string, string>,
): Record<string, Finding[]> {
  const sent: Record<string, Finding[]> = {}
  for (const change of changes) {
    const ref = change.frame
    const [project = '', page = '', name = ''] = ref.split('/')
    const target = { root, project, page, name }
    if (change.created) raised.delete(ref)
    const before =
      !change.created && change.before
        ? tracker.version(ref, change.before)
        : null
    let list: Finding[]
    try {
      const after = readFrame(target)
      if (contentHash(after.html) !== change.hash) continue
      const against = (bytes: string | null | undefined) =>
        bytes === null || bytes === undefined
          ? []
          : checkOutranked(frameFrom(target, bytes), after)
      list = against(before)
      if (list.length > 0 && before !== null) {
        raised.set(ref, before)
      } else {
        list = against(raised.get(ref))
        if (list.length === 0) raised.delete(ref)
      }
    } catch {
      raised.delete(ref)
      continue
    }
    Object.assign(sent, findings.setChanged(ref, list))
  }
  return sent
}

async function modifiedAt(path: string): Promise<string | null> {
  try {
    return new Date((await stat(path)).mtimeMs).toISOString()
  } catch {
    return null
  }
}

/**
 * A notes write changes its page's notes, and a frame write can lose an
 * element note its anchor, so both reread the page. A frame write on a page
 * holding no notes sends nothing.
 */
async function pushNotes(
  root: string,
  paths: string[],
  hub: LiveHub,
  delivery: Delivery,
): Promise<void> {
  const pages = new Map<
    string,
    { project: string; page: string; notes: boolean }
  >()
  for (const path of paths) {
    const parts = relative(root, path).split(sep)
    const [project, page, file] = parts
    if (parts.length !== 3 || !project || !page || !file) continue
    const notes = file === NOTES_FILE
    if (!notes && !file.endsWith(FRAME_EXTENSION)) continue
    const key = `${project}/${page}`
    pages.set(key, {
      project,
      page,
      notes: notes || (pages.get(key)?.notes ?? false),
    })
  }
  let touchedNotes = false
  for (const [key, { project, page, notes }] of pages) {
    const list = await pageView(root, {
      project,
      page,
      path: notesPath(root, project, page),
    })
    if (notes || list.length > 0) {
      hub.broadcast({ type: 'notes', page: key, notes: list })
    }
    touchedNotes ||= notes
  }
  if (touchedNotes) await delivery.offer()
}
