---
title: Checks
description: The content rules Frameboard enforces, the three paths that run them, and a project's own rules
---

# Checks

## Overview

Owns the content rules and where they run. A frame that breaks one is reported without anyone remembering to check, both to the agent straight after its write and on the frame's label on the board.

## Layout

### `src/server/checks/`

Owns the rules, the cascade they read, and the runner over a frame, a page, or a project. The `check` verb, the server on every watched batch, and the plugin hook all run `checkFrameIn`, so no path drifts from another. It imports only `src/shared/` and its libraries, so the hook bundles it without commander, Hono, chokidar, ws, or zod.

- A project turns a rule off by listing its id in `checks.off` of `project.json`, an error rule included, and every path filters through `withoutOff`
- `check` exits 8 with `check-findings` when any finding is an error, so a script branches on the exit alone, and warnings alone exit 0
- The hook prints `decision: "block"` with the findings as `reason`, which Claude Code places beside the tool result as feedback on that write
- The hook answers a frame and a stylesheet directly under a project's `assets/transitions/` inside a board, and exits 0 silently for any other write, a vanished file, or stdin that is not JSON
- A hook run cost a median 80 ms on Bun against a bare start of 17 ms. Measured at d609955 on 2026-10-17.

### `src/server/checks/browser/`

Owns the browser tier, the rules that read a rendered page. `checkRendered` opens a frame through capture's `openFrame` at its layout size, in light then dark, with `fonts: 'wait'`. Each rule reports one finding per frame naming the first offender, except `dropped-declaration`, which reports each declaration.

| Rule                  | Reads                                                                                         |
| --------------------- | --------------------------------------------------------------------------------------------- |
| `clipped`             | Uncropped boxes grown to their line box against the frame's box, the only error in the tier   |
| `scrollbar`           | Overflow past 1 px of slack                                                                   |
| `viewport`            | A reread at twice the viewport height through `fit`'s `readContentSize`, after a resize       |
| `scroll-effect`       | Sticky outside an inner scroll box, a `scroll` listener, or a scroll timeline in a hug frame  |
| `dropped-declaration` | Each declaration the page's `CSS.supports` refuses, at its source location, with no theme     |
| `min-font-size`       | Text below the floor, once `project.json` sets its `checks` key                               |
| `min-contrast`        | Text contrast, once its `checks` key is set, skipping text over an image, gradient, or effect |

The server's checker runs every rule once per box through `acrossWidths` in `rendered-findings.ts`, and the bullets below hold what the code does not say.

- A finding read at a linked width carries `width`, which `formatFinding` prints as `<path>@<width>`, and one the frame's own box already reported is left out
- A `scroll` frame overflows on purpose, so `clipped` reads its width alone and `viewport` skips it
- `dropped-declaration` skips custom properties, `@supports`, other at-rules, the `-moz-`, `-ms-`, and `-o-` prefixes, and a `-webkit-` fallback beside its standard property
- A frame holds its static findings, then its last agent write's change findings, then its last browser findings, in `src/server/live/`, which `canon/context/board/server.md` owns
- A frame queued for recheck again before its result lands drops that result, a failed recheck lands an empty list, and a reading of a file since rewritten lands nothing

### `src/server/routes/checks.ts`

Owns `POST /api/checks`, behind the write token, which `check` calls with the refs it read. It rescans the board first, moves those frames to the front of both queues, hands a write the watcher has not batched yet to the change tracker, and waits out that write's grace and every pending check of those frames before answering.

- It answers the held change findings, then the held browser findings, and `browser: { ran: true }`
- A browser that does not launch answers `browser: { ran: false, reason: 'browser-not-found' }` with the change findings alone
- `check` with no live server, or one silent for 120 seconds, sets `browser.reason` to `server-not-running` and says so on its last line

### Other folders

The plugin side of the hook sits outside `src/`.

- `plugins/frameboard/hooks/` owns `hooks.json` and the `check.sh` resolver the plugin runs after every agent write

## Gotchas

- `checkFrame` sits in `frame.ts` apart from `run.ts`, because the runner reads the board scanner and its zod import would double the hook's start
- Browser rules run on the server and never in the hook, so an agent sees them through `check` with a server running, never in the turn of its write
- A start checks every frame whose stored key moved, so a spec reading a label count waits on `check` first, and an edited rule needs `.run/checks.json` deleted, since keys hold the version alone
- The browser comparison in `e2e/cli/checks.spec.ts` never sets `color-scheme`, since that flips the default text color around a fixed literal color
- Both cropping tests walk the containing block chain, skipping an ancestor an absolute element anchors past, so an escaping element counts for `clipped`
