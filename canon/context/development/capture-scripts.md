---
title: Capture scripts
description: The scripts that capture and measure what the board renders, and the preview served from a drive copy
---

# Capture scripts

## Overview

Owns the commands that capture screenshots, drift, and design references, the one that measures the canvas, and the preview a drive reads from its copy. The scripts that gate a change and serve the board are in `canon/context/development/local.md`, and the capture harness is in `canon/context/development/testing.md`.

## Layout

These capture and measure what the board renders.

| Command                      | Purpose                                                                                                |
| ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| `bun run measure:canvas`     | Pans and pinches over fifty live frames in headed Chrome and prints p50, p95, and the share past 33 ms |
| `bun run screenshot`         | Builds, serves a board copy, and captures every case into `screenshots/` and `e2e/evidence/`           |
| `bun run screenshot:drift`   | Captures twice into `screenshots/drift/` and sorts evidence into noise, stale, and equal               |
| `bun run screenshot:compare` | Captures each shell surface at 1440 by 900, light and dark, into `screenshots/compare/`                |
| `bun run smoke:prod`         | Captures against `SCREENSHOT_BASE_URL`, failing on any console error                                   |
| `bun run design:sync`        | Builds, then runs `references sync canon/design` over the main root's `.canon/board`                   |

The capture scripts each carry a condition the table leaves out.

- `screenshot` leaves a committed image alone when at most 200 pixels differ and no channel moves past 64, which absorbs antialiased corners no mask can hold, so a smaller real change stays uncaptured
- `FRAMEBOARD_EVIDENCE_ROOT` sends `screenshot` evidence to that folder as captured, with no tolerance, and the committed set stays unread
- A painted change inside those limits writes its image with `FRAMEBOARD_EVIDENCE_ROOT=e2e/evidence SCREENSHOT_FILTER=<case> bun run screenshot`
- `screenshot:compare` builds first and serves its own boards
- `measure:canvas` sits outside the gate, because its number describes the developer's own browser and screen and a CI runner's says nothing about either

`design:sync` carries more conditions than the other capture scripts.

- `design:sync --check` passes the flag to the verb, which writes nothing and exits 14 on a changed, missing, or stray file
- It reads the design board at the main root's `.canon/board` from any worktree, through the path the script derives from `git rev-parse`
- The verb's formatter options live in `src/server/references/format.ts`, and `.oxfmtrc.json` no longer reaches a reference
- An oxfmt bump changes every reference's bytes, so the commit bumping it runs `design:sync` too

A running `preview` and the drive copy it serves carry these conditions.

- `canon pr drive-copy` rebuilds the copy but leaves its `.run/` alone, since `canon/config/preview.json` keeps that path, so a running `preview` keeps its address file and board key
- The rebuild copies the checkout as it stands, so the seeded pages and the reservation on `webapp/settings` reach the copy through the `seed` key, which runs `scripts/drive-seed.ts`
- The edit link from `preview` works once, so a late reader or a take opens `/api/access/open`, which a server reused from a bare `serve` answers with 404
- A claim lives in the ignored `.run/` and lapses after five minutes, so a drive renews it with `bun dist/cli.js editing <frame-ref> --root <copyRoot>/test/fixtures/boards/basic --session drive-review`
- The board port `dev` starts serves `src/client` unbuilt, so opening it directly gets a page that never loads, and only Vite's address works
