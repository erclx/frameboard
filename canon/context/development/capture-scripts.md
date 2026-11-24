---
title: Capture scripts
description: The scripts that capture and measure what the board renders, and the preview served from a drive copy
---

# Capture scripts

## Overview

Owns the commands that capture screenshots, drift, and design references, the one that measures the canvas and its frames' processes, the comparison CI runs on two commits, and the preview a drive reads from its copy.

The scripts that gate a change and serve the board are in `canon/context/development/local.md`, and the capture harness is in `canon/context/development/testing.md`.

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

- Only `design:sync` writes `canon/design/` reference files. Each group's file beside its folder is hand-written, and `canon indexes regen canon/design` writes the list.
- `design:sync --check` passes the flag to the verb, which writes nothing, exits 14 on a changed, missing, or stray file, and only warns on PNG bytes
- A sync keeps a held PNG whose frame's HTML, assets, and size held still, since a re-render of the same HTML can land on other fonts
- `design:sync -- --rerender` redraws every PNG, owed after a token sheet or kit edit, which the keep rule never reads, and after a capture change

Where the sync reads from, and what moves every reference, follow.

- It reads the design board at the main root's `.canon/board` from any worktree, through the path the script derives from `git rev-parse`
- The verb's formatter options live in `src/server/references/format.ts`, and `.oxfmtrc.json` no longer reaches a reference
- An oxfmt bump changes every reference's bytes, so the commit bumping it runs `design:sync` too

`scripts/perf-compare/` measures two commits for `perf-compare.yml`, on a runner and never on a developer's machine. Start it with `gh workflow run perf-compare.yml -f base=<ref> -f head=<ref>` and read the run's summary page.

- It generates a board of 1,000 frames, opens its 40-frame page in a tab, and writes a frame of another project
- Both sides start once at the same time, uncounted, to fill what a second start reads, and the writes are measured on those servers
- A start is quiet once its server and browser use under 5% of a core for five seconds, and a second start still busy at two minutes reads `not reached`
- CPU covers the start until quiet or the two minutes, so it is a floor where quiet reads `not reached`

What a run says, and what it leans on, follow.

- Read a change against a run of one commit with itself, which shows how far apart two equal sides land
- The harness waits for the live socket's `board` message and the canvas's `[data-layer]`, so a change to either shape moves the harness too

A running `preview` and the drive copy it serves carry these conditions.

- `canon pr drive-copy` rebuilds the copy but leaves its `.run/` alone, which `[preview]` in `canon/config/app.toml` keeps, so a running `preview` keeps its address file and board key
- The rebuild copies the checkout as it stands, so the seeded pages and the reservation on `webapp/settings` reach the copy through the `seed` key, which runs `scripts/drive-seed.ts`
- The edit link from `preview` works once, so a late reader or a take opens `/api/access/open`, which a server reused from a bare `serve` answers with 404
- A claim lives in the ignored `.run/` and lapses after five minutes, so a drive renews it with `bun dist/cli.js editing <frame-ref> --root <copyRoot>/test/fixtures/boards/basic --session drive-review`
- The board port `dev` starts serves `src/client` unbuilt, so opening it directly gets a page that never loads, and only Vite's address works
