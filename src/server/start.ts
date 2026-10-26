import { randomUUID } from 'node:crypto'
import { EventEmitter, once } from 'node:events'
import { stat } from 'node:fs/promises'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { relative, sep } from 'node:path'

import { serve } from '@hono/node-server'

import type { FrameChange } from '@/shared/records/changes'
import { THEMES } from '@/shared/theme'

import { type Access } from './access/guard'
import { cookieName, loadBoardKey } from './access/key'
import { createTickets } from './access/tickets'
import { createApp, isBoardHost } from './app'
import { FRAME_EXTENSION, scanBoard } from './board/scan'
import { launchCaptureBrowser, type Launcher } from './capture/browser'
import { measureContent } from './capture/fit'
import { createWarmBrowser, createWarmRenderer } from './capture/render'
import { createThumbnailStore, type ThumbnailStore } from './capture/thumbnails'
import { type ChangeTracker, createChangeTracker } from './changes/tracker'
import { checkRendered } from './checks/browser/rendered'
import { readConfig } from './checks/frame'
import { boardPath } from './checks/frame-source'
import { type ClaimsPush, createClaimsPush } from './claims/push'
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
  createRenderedFindings,
  type RenderedFindings,
} from './live/rendered-findings'
import { createSelectionHolder } from './live/selection'
import {
  type BoardWatcher,
  type MovedFolder,
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

// Loopback only: the board serves the operator's own files, so it stays off the LAN.
const HOSTNAME = '127.0.0.1'

/**
 * How long a batch's changes wait before the board hears of them, so a hand
 * write of many frames, whose first files can reach a batch at its 250 ms
 * ceiling before the history records the step, is withdrawn as the board's
 * own rather than marked.
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
}

/**
 * The board tabs holding a live connection to this server, counting apart the
 * ones that can write. The route a tab connects through calls `open` and
 * `close`, and `serve` waits on a writer before deciding to open a tab of its
 * own, since a tab typed in by hand reads the board but cannot change it.
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
  // Scans run one at a time, so a slow scan never lands after a newer one and
  // sends a board older than the last.
  let scanning: Promise<unknown> = Promise.resolve()
  const inTurn = <T>(task: () => Promise<T>): Promise<T> => {
    const run = scanning.then(task)
    scanning = run.catch(() => {})
    return run
  }
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
  const settling = new Set<ReturnType<typeof setTimeout>>()
  const settleLater = (held: FrameChange[]) => {
    const timer = setTimeout(() => {
      settling.delete(timer)
      void inTurn(async () => {
        const changes = tracker.settle(held)
        if (changes.length > 0) hub.broadcast({ type: 'changes', changes })
      })
    }, OWN_GRACE_MS)
    settling.add(timer)
  }
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
    snapshot: () => inTurn(() => scanBoard(root)),
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
  // One browser serves the PNG route, the checker, and the thumbnails, each on
  // its own queue, launched by the startup sweep.
  const browser = createWarmBrowser(() =>
    launchCaptureBrowser({
      purpose: 'Board PNGs, thumbnails, and browser checks',
      launch,
    }),
  )
  const baseUrl = () => `http://${HOSTNAME}:${bound}`
  const renderFrame = createWarmRenderer({ baseUrl, browser, scale: 2 })
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
      const list = await checkRendered(await browser.get(), {
        baseUrl: baseUrl(),
        root,
        frame: {
          ref: frame.ref,
          path: boardPath(root, frame.path),
          box: { width: frame.box.width, height: frame.box.height },
        },
        config: readConfig(root, frame.project),
      })
      // A file written since the scan was read at the box from before the
      // write, which a hugging frame is about to leave, so that write's batch
      // checks it again instead.
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
  const measure: MeasureFrame = async (frame) =>
    measureContent(await browser.get(), {
      baseUrl: baseUrl(),
      ref: frame.ref,
      box: frame.box,
      hugWidth: frame.hugWidth,
      fonts: 'wait',
    })
  const hug = createHug({ root, measure })
  const app = createApp({
    clientDir,
    facesDir,
    tokens,
    root,
    port: boundPort,
    tickets,
    delivery,
    dispatch: dispatcher,
    history,
    selection,
    renderFrame,
    thumbnails,
    measure,
    frameVersion: tracker.version,
    // A batch logging the agent's write may still be running when the board
    // sends the edit it queued behind the claim, so the lookup waits its turn.
    settledVersion: (ref, hash) =>
      inTurn(async () => tracker.version(ref, hash)),
    checks: {
      refresh: () =>
        inTurn(async () => {
          try {
            rendered.queue(await scanBoard(root), [])
          } catch {
            // A board folder mid-removal does not scan, and the batch catches up.
          }
        }),
      settle: rendered.settle,
      rendered: findings.rendered,
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
      show: (ref) => {
        hub.broadcast({ type: 'show', ref })
        return tabs.count
      },
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

  // Every frame is checked once at start, ahead of any hello's findings, and
  // queued for the browser sweep, whose findings follow as they land.
  void inTurn(async () => {
    let board = await scanBoard(root)
    // Only a frame written while no server ran holds the first board, since
    // every other stored size already holds, and the rest measure after it.
    const stale = await writtenSinceLayout(board).catch((): string[] => [])
    if (await hug.now(board, stale).catch(() => false)) {
      board = await scanBoard(root)
    }
    await tracker.prime(board)
    findings.update(board, 'all')
    rendered.queue(board, [])
    hug.later(
      board,
      board.projects.flatMap((project) =>
        project.pages.flatMap((page) =>
          page.frames
            .map((frame) => frame.ref)
            .filter((ref) => !stale.includes(ref)),
        ),
      ),
    )
  })
  // A claims file left by an earlier server arms the expiry from what it holds.
  void claims.push()
  const watcher = await watchBoard(root, tokens ? [tokens] : [])
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
    close: async () => {
      rendered.close()
      hug.close()
      claims.close()
      for (const timer of settling) clearTimeout(timer)
      await Promise.all([
        watcher.close(),
        hub.close(),
        browser.close(),
        emptyTrash(root),
      ])
      await new Promise<void>((done, fail) => {
        server.close((error) => (error ? fail(error) : done()))
        // A tab's keep-alive connection would hold close open indefinitely.
        server.closeAllConnections()
      })
    },
  }
}

/**
 * One rescan per batch: the whole board to every tab, then the frames to
 * reload, marking their thumbnails stale in both themes without rendering
 * any, then the findings of every frame the batch rechecked, queueing the
 * same frames for the browser checker, then the notes of every page whose
 * notes or frames it touched, whose queue it offers to delivery. The frames
 * an agent changed wait out the grace before the board hears of them.
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
  },
): Promise<void> {
  let board
  let own: string[]
  try {
    board = await scanBoard(root)
    own = ownFileRefs(board, paths)
    // A frame its own file reloaded is measured first, so the board never
    // shows it at its old size, and the write's own batch reloads nothing.
    if (await hug.now(board, own).catch(() => false)) {
      board = await scanBoard(root)
    }
  } catch {
    // A board folder mid-removal does not scan, and the next batch catches up.
    return
  }
  hub.broadcast({ type: 'board', data: board })
  const refs = reloadRefs(root, paths, board, tokens)
  // A token or asset change reloads every frame it reaches, so those are
  // measured after the push rather than holding it.
  hug.later(
    board,
    refs.filter((ref) => !own.includes(ref)),
  )
  if (refs.length > 0) {
    const reloads = unmovedRefs(refs, board, moved())
    if (reloads.length > 0) hub.broadcast({ type: 'reload', refs: reloads })
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
