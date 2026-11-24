---
title: Board server
description: Folder watcher, socket hub, claims record, write access, and the HTTP routes behind the board
---

# Board server

## Overview

Owns the server half of the board, being the folder watcher and socket hub, the claims record, who may write, and the HTTP routes.

The browser app is in `canon/context/board/shell.md`, undo's history in `canon/context/board/commands.md`, the live findings in `canon/context/agent/checks.md`, and the phone link and the clipboard copy in `canon/context/board/phone-clipboard.md`.

## Layout

### `src/server/`

Owns the loopback server around the folders below. `app.ts` is the Hono app, `start.ts` binds it to `127.0.0.1` alone since the board serves the developer's own files, `address.ts` writes the address file and its health check, and `author.ts` reads the signing name, a saved one winning over git's.

### `src/server/live/`

Owns the board folder's watcher, the socket hub, the decision to open a tab, and the selection `selection.ts` keeps in memory from the last writing tab, forgotten once that tab's socket closes. A reload carries a frame's hash only when its own file was the batch's sole cause, so a tab keeps a page already showing those bytes.

- `.html` or `.swap` reloads its frame, a page file its page, non-kit media its linking frames, the rest and font records the project, `layout.json` a `kit` change, `notes.json` and licenses nothing
- Writes gather into batches closing 50 ms after the last event or 250 ms after the first, and a watch resolves only past its first 100 ms, since `fs.watch` on macOS drops writes then
- `hug.ts` measures a hugging frame under the layout lock with no undo step, before the board goes out for its own reload and after it for an asset or sheet, and logs a failed measure to stderr
- A start answers hellos from what `remembered.ts` keyed in `.run/checks.json`, one changed asset moving its whole project, and `start-checks.ts` rechecks what moved in slices of the scan turn
- A frame placed mid-measure is measured in that rescan, one a waiting batch saw placed by the batch naming its `layout.json`, and a size whose file changed since its scan is dropped

### `src/server/claims/`

Owns the claims record, its expiry, and the gate on hand writes, apart from `notes/` and `board/` since the three change together. `land.ts` runs at start and ahead of each batch's scan, writing a reserved frame's layout entry at the claim's box once its file exists and dropping the box.

- `.run/claims.json` is `{ version: 1, claims }`, each naming its `frame` ref, `session`, `agent`, `tag`, `claimedAt`, and `expiresAt`, and a reservation adds its `box` and `set`
- A renewal keeps `claimedAt`, `box`, and `set`, moves `expiresAt` for every live claim in the set, and stamps `drawingAt` on a reserved frame
- A batch naming the claims file sends `claims` alone, with no rescan or browser check, and a timer rebroadcasts at the soonest expiry
- A file that does not parse reads as no claims on the board, and `editing` refuses it as `claims-invalid` rather than overwrite it
- `POST /api/claims/release` drops a reservation whichever session holds it, behind `requireWriter`, and refuses a claim with no box

### `src/server/access/`

Owns who may write, apart from the route modules.

- `key.ts` loads the board key from `.run/board-key.json`, `tickets.ts` mints single-use tickets valid for two minutes, or up to 60 by `open --ttl`, and `guard.ts` holds `isWriter` and `requireWriter`
- A writer is the address file's token as a bearer, or the board's cookie carrying the key sent with the board's own `Origin`, and the live socket's upgrade asks the same rule
- A route that changes the board folder or drives an agent mounts `requireWriter`, and a GET that only reads takes no guard

### `src/server/routes/access.ts`

Owns the routes that hand a tab the key, among them `POST /api/access/edit`, which `serve --edit-button` mounts and the button `editButton` on the `access` message draws in a reading tab posts. View-only guards against web pages and frames, whose `Origin` the rule refuses, and never against a program that can read `.run/`.

- Under the flag, off by default, any program reaching the port can send the headers the grant reads and hold the key, since no check on a request keeps a program out
- A key holder writes, sends notes to a listening session, starts one under `FRAMEBOARD_DISPATCH`, generates images on the environment's provider keys, and opens the phone link
- The key outlives the flag and every restart, so taking the flag off revokes nothing. Deleting `.run/board-key.json` and restarting does.
- The grant takes JSON from an `Origin` equal to the address asked, since a kit page's form carries the board's `Origin` and a page on `[::1]` sends one reading `localhost`
- The client's HTML answers `frame-ancestors 'none'` under the flag alone, so no page lures the press that grants, and a kit page always answers `form-action 'none'`

### `src/server/routes/`

Owns the HTTP route modules `app.ts` mounts, one per surface, being the frame and asset routes, access, the writes `api.ts` mounts behind `requireWriter`, and the element tree. Frames load from the port in `canon/context/board/frame-origin.md`, and the board's port sends a GET under `/frames/` there with a 307.

- A non-frame file answers a single byte `Range` with a streamed 206, so a `<video>` seeks, while a frame is served whole since its head is spliced in memory
- A non-frame file carries a weak `ETag` under `no-cache`, while a frame, a `?at=` version, a 206, and a 416 stay `no-store`, since an asset edit reloads the frames it reaches
- A file's `frames` count comes from the cache in `src/server/board/asset-usage.ts` over the link check's `frameLoads`, which a watcher batch under the project drops
- A kit remove records the folder's take-out and every cleared `kit` key as one step, so one undo brings back the kit and the frames naming it
- Kit files sit under `/frameboard/`, since `/kits` shadows Vite's module folder, each page and SVG under the preview policy, and `GET /api/access/open` answers only under `--open-route`

### `src/server/models/`

Owns the model viewer script a frame loads to show a `<model-viewer>`. `viewer.ts` copies the pinned `@google/model-viewer` build into a project's `assets/` the first time a model is placed there, since a frame loads nothing over the network.

- A built run reads the copy `scripts/copy-viewer.ts` put in `dist/viewer/`, and a source run reads the package, so `docs` prints whichever path the install holds
- The copy never overwrites a file already holding its name, and removing a frame's last model leaves both the file and the head's script tag

## Gotchas

- A cookie write needs the board's own `Origin`, since cookies and SameSite ignore the port and another `127.0.0.1` port would otherwise write
- The frame route answers 404 for board records, dot-named paths, and paths leaving the project by realpath, and routes refuse a foreign `Host` and the socket a foreign `Origin`, against DNS rebinding
- `serve` reads `FRAMEBOARD_DISPATCH` from its environment once at start and never from a board file, so a cloned board cannot make Send run anything
- Exporting `FRAMEBOARD_DISPATCH` under a running server changes nothing until it restarts
- A dispatched note lands `delivered` to the session id the route minted, so the started session's inbox never prints it again, and a command exiting 0 or still running after 2 s counts as started
