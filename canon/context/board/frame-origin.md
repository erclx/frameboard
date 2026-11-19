---
title: Frame port
description: The second loopback listener that serves frames, their assets, and the look apart from the board's own origin
---

# Frame port

## Overview

Owns the listener every frame loads from, so a frame's script carries an `Origin` the write guard in `canon/context/board/server.md` refuses. The board builds each frame URL in `src/client/live/frame-url.ts` from the port its socket hands over, and the channel that crosses the two origins is in `canon/context/board/frame-bridge.md`.

## Layout

### `src/server/frame-origin/`

Owns the frame port, started by `start.ts` on a free `127.0.0.1` port beside the board's and closed with it. It mounts the same look and frame routes the capture host and the phone link use, so a frame loads the same bytes everywhere.

- It answers GET and HEAD under the frame and look routes alone, so every `/api/` path and the board client answer 404 there
- A `Host` naming another port or a foreign name answers 403, and both loopback names pass, so a `localhost` tab loads frames on `localhost`
- Every page and SVG carries `frame-ancestors 'self'` plus either loopback name on any port, so no foreign page can embed a frame
- A loopback `Origin` is echoed in `Access-Control-Allow-Origin` with no credentials, so the board's own reads of frame bytes cross the port
- The hub sends a board tab `{ type: 'frames', port }` first on its hello, and the warm renderer, checks, thumbnails, and the fit measure all read frames here

## Gotchas

- A frame's storage, cookies, and IndexedDB live under the frame port's origin, which a restart moves, so a prototype keeping state across reloads loses it once per start
- A frame iframe delegates only the features in `FRAME_ALLOW`, since a cross-origin iframe inherits none of the `self` defaults a same-origin one did
- `bun run dev` rewrites `Origin` on `/api` only for Vite's own page, so a frame posting through Vite keeps its frame port `Origin` and gets 401
