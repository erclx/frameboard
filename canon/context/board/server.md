---
title: Board server
description: Folder watcher, socket hub, claims record, write access, and the HTTP routes behind the board
---

# Board server

## Overview

Owns the server half of the board, being the folder watcher and socket hub, the claims record, who may write, and the HTTP routes. The browser app is in `canon/context/board/shell.md`, undo's history in `canon/context/board/hand-actions.md`, and the live findings in `canon/context/agent/checks.md`.

## Layout

### `src/server/`

Owns the loopback server around the folders below. `app.ts` is the Hono app, `start.ts` binds it to `127.0.0.1` alone since the board serves the developer's own files, `address.ts` writes the address file and its health check, and `author.ts` reads the signing name, a saved one winning over git's.

### `src/server/live/`

Owns the board folder's watcher, the socket hub, the decision to open a tab, and the selection the open board reports.

- A frame's own `.html` or a temp file such as `hero.html.swap` reloads that frame, unless the board's own rename only moved it, and any other page-folder file reloads the page
- A file under `assets/` reloads every frame in the project, and `layout.json` and `notes.json` reload nothing
- Writes gather into batches closing 50 ms after the last event or 250 ms after the first, so one agent turn costs one rescan
- The server checks every frame at start and rechecks each batch's frames
- `fs.watch` on macOS drops writes in its first tens of milliseconds, so the watch counts nothing for its first 100 ms and resolves only once warm

`hug.ts` measures a hugging frame its own file reloaded or `frame add` placed before the board is sent, and one an asset or token sheet reloaded after it, writing the size under the layout lock with no undo step. At start only a frame written with no server running holds the first board. Its own batch reloads nothing, so nothing measures twice.

- A frame placed while a batch measured is in that batch's rescan, so the batch measures it once more before sending the board
- A size whose frame file changed since the scan it was measured from is dropped, since that write's own batch measures it again

`selection.ts` keeps the last selection a writing tab reported, in memory alone, and forgets it once the socket of the tab that sent it closes, which the tab's hello names by id.

### `src/server/claims/`

Owns the claims record, its expiry, and the gate on hand writes, apart from `notes/` and `board/` since the three change together.

- `.run/claims.json` is `{ version: 1, claims }`, each naming its `frame` ref, `session`, `agent`, `tag`, `claimedAt`, and `expiresAt`
- A renewal keeps `claimedAt` and moves only `expiresAt`
- A batch naming the claims file sends `claims` alone, with no rescan or browser check
- A timer armed at start and on every change rebroadcasts at the soonest expiry
- A file that does not parse reads as no claims on the board, and `editing` refuses it as `claims-invalid` rather than overwrite it

### `src/server/access/`

Owns who may write, apart from the route modules.

- `key.ts` loads the board key from `.run/board-key.json`, `tickets.ts` mints single-use tickets valid for two minutes, and `guard.ts` holds `isWriter` and `requireWriter`
- A writer is the address file's token as a bearer, or the board's cookie carrying the key sent with the board's own `Origin`, and the live socket's upgrade asks the same rule
- A route that changes the board folder or drives an agent mounts `requireWriter`, and a GET that only reads takes no guard

### `src/server/routes/`

Owns the HTTP route modules `app.ts` mounts, one per surface. Frames load same-origin and unsandboxed, since element selection and the inspector work inside a frame's DOM, and the board key keeps other pages from writing.

- `/frames/<project>/<page>/<file>` serves a page folder and `/frames/<project>/assets/<path>` the assets, so relative links resolve unrewritten, and `?at=<hash>` a replaced frame version
- `assets.ts` answers `GET /api/projects/:project/assets` with the listing and `POST` with a `multipart/form-data` drop in `files`, behind `requireWriter` and a 64 MiB limit answering 413
- `access.ts` trades a ticket for the cookie, mints one with its `expiresAt` for a bearer, and lands a failed redeem on `/?link=expired`. `api.ts` mounts every write route behind `requireWriter`
  - Under the hidden `serve --open-route` alone, `access.ts` also answers `GET /api/access/open` with a 303 to a fresh redeem URL
- `structure.ts` answers `POST /api/<noun>/<verb>` with bodies mirroring the CLI flags and one step each, and `history.ts` answers `POST /api/undo` and `/api/redo`, sharing `envelope.ts` refusals
- `elements.ts` answers a frame's element tree from the file, so a culled frame lists the indices `edit` takes, and holds `GET /api/selection` and the tab's `POST` behind `requireWriter`

## Gotchas

- A cookie write needs the board's own `Origin`, since cookies and SameSite ignore the port and another `127.0.0.1` port would otherwise write
- The frame route answers 404 for board records, dot-named paths, and paths leaving the project by realpath, and routes refuse a foreign `Host` and the socket a foreign `Origin`, against DNS rebinding
- `serve` reads `FRAMEBOARD_DISPATCH` from its environment once at start and never from a board file, so a cloned board cannot make Send run anything
- Exporting `FRAMEBOARD_DISPATCH` under a running server changes nothing until it restarts
- A dispatched note lands `delivered` to the session id the route minted, so the started session's inbox never prints it again, and a command exiting 0 or still running after 2 s counts as started
