---
title: Phone link and clipboard
description: The read-only phone listener for one project and the copy of frames onto the OS clipboard
---

# Phone link and clipboard

## Overview

Owns two outputs the board server hands outside the browser, being the phone link and the clipboard copy. Both sit behind the write guard in `canon/context/board/server.md`, and the client side of a copy is in `canon/context/board/hand-actions.md`.

## Layout

### `src/server/preview/`

Owns the phone link, a second read-only listener for one project, apart from `access/`, which guards the board's own port. `routes/preview.ts` answers `POST /api/preview` with `{ ref, port? }` and `DELETE /api/preview` with `{ token? }`, both behind `requireWriter`.

- `listener.ts` binds the private address `address.ts` picked, alone, at port 4400 or the one given, and a free port when that is taken, while the board's own listener stays on loopback
- It answers GET and HEAD under `/v/<token>/` alone, mapping onto the board's own frame and look routes so their refusals hold, and any other token, project, path, or method answers 404
- A served frame imports its sheets under the link through the frame route's `base`, takes the drawn controls' hiding style, and never sees a `?at=` query
- The board holds one listener at a time, a start ending the last and minting a new 96-bit token, and the board ends it as it closes
- `address.ts` prefers 192.168, then 10, then 172.16 to 172.31, where container bridges sit, and a machine with none refuses `no-network-address`

### `src/server/clipboard/`

Owns putting copied frames on the OS clipboard as one file list. `routes/clipboard.ts` answers `POST /api/frames/clipboard` with `{ refs, theme }` and an optional `themes` map of ref to theme behind `requireWriter`, rendering each frame at 2x in turn in `themes[ref]` or else `theme`, on the renderer `png.ts` uses.

- `files.ts` picks the backend at start, and only WSL with `powershell.exe` on its `PATH` has one
- `wsl.ts` writes the images into Windows' temp folder and runs `Set-Clipboard -Path`, one copy at a time, since each copy clears the shared folder and would delete the files an overlapping copy names
- With no backend the route refuses `clipboard-unsupported` and `/api/health` reports `clipboard: null`, so the board stitches several frames into one image
