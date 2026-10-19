---
title: Checks
description: The content rules Frameboard enforces, the three paths that run them, and a project's own rules
---

# Checks

## Overview

Owns the content rules and where they run. A frame that breaks one is reported without anyone remembering to check, both to the agent straight after its write and on the frame's label on the board.

## Layout

### `src/server/checks/`

Owns the rules, the cascade they read, and the runner over a frame, a page, or a project. It imports only `src/shared/` and its libraries, so the hook bundles it without the server.

- The `check` verb, the server on every watched batch, and the plugin hook all run `checkFrameIn`, so no path drifts from another
- `check` exits 8 with `check-findings` and the result in the error's details when any finding is an error, so a script branches on the exit alone. A result holding warnings alone exits 0
- Exact rules read the parsed file, being `naming`, `dot-folder`, `head-body`, `table-tbody`, `outside-link`, `network`, and `missing-file`
- Selector rules read the cascade, being `default-font`, `generic-font`, and `theme`, plus `allowed-fonts` and `uppercase` only when `project.json` sets `checks.allowedFonts` or `checks.noUppercase`
- The cascade matches with css-select and weighs with `@bramus/specificity`, resolves custom properties per element, and reads token sheets ahead of the frame's own, the board sheet being the `--tokens` sheet the address file records while a server runs

### `src/server/checks/browser/`

Owns the browser tier, the rules that read a rendered page. It sits in its own folder so the hook bundle, which imports `checks/frame.ts` alone, never reaches it or `playwright-core`.

- `checkRendered` opens a frame through capture's `openFrame` at its layout size, in light and then dark, with `fonts: 'wait'` so a missing face is measured in the fallback the board shows. A rule one theme alone trips opens its message with that theme
- `clipped`, `scrollbar`, and `min-font-size` report `error`, and `viewport` reports `warning`, since a full-height screen sizes off the viewport on purpose
- Each rule reports at most one finding per frame, naming the first offending element by its edit index and how many more there are
- `clipped` measures the boxes no ancestor crops, so an ellipsis or a crop is no finding. `scrollbar` takes one pixel of slack, and `viewport` rereads the content with the viewport twice as tall through `fit`'s `readContentSize`
- `min-font-size` runs only when `project.json` sets `checks.minFontSize` to a positive number of pixels, and picks text elements the way capture's font check does

### `src/cli/`

Owns the hook's entry, bundled to `dist/hook.js` beside the CLI.

- The hook prints `decision: "block"` with the findings as `reason`, which Claude Code places beside the tool result as feedback on that write
- It exits 0 and prints nothing for a non-frame write, a frame outside any board, a file gone since, and stdin that is not JSON, so a write is never reported as failed
- The bundle carries no commander, Hono, chokidar, ws, or zod, and a run cost a median 80 ms on Bun against a bare start of 17 ms. Measured at d609955 on 2026-10-17.

### `src/server/live/`

Owns the findings the board holds between watch batches, and the warm checker that runs the browser tier.

- The server sends the whole findings map after the board on hello, then a partial map per batch where an empty list clears a frame
- Each frame's list is its static findings followed by the browser findings last landed for it, so the client keeps one list per ref
- A change to a token sheet rechecks and reloads every frame it reaches, and a change to a project's `project.json` rechecks them without a reload
- `rendered-findings.ts` queues browser rechecks one at a time on the PNG route's warm browser but its own queue, sweeping every frame once at start. A batch queues the frames `recheckRefs` names plus every frame whose box or file time changed, since a resize writes `layout.json` alone
- A frame queued again before its result lands drops that result, and a failed recheck lands an empty list, so a label never shows findings from an older file. The first recheck after a browser launches queues every frame again

### `src/server/routes/checks.ts`

Owns `POST /api/checks`, behind the write token, which `check` calls with the refs it read.

- It rescans the board first, queueing a write the watcher has not batched yet, then waits until no recheck of those frames is pending and answers the held browser findings and `browser: { ran: true }`
- A browser that does not launch answers `browser: { ran: false, reason: 'browser-not-found' }` with no findings
- `check` with no live server, or one that does not answer in 120 seconds, sets `browser.reason` to `server-not-running` and closes its human output on a line saying so

### Other folders

The plugin side of the hook sits outside `src/`.

- `plugins/frameboard/hooks/` owns `hooks.json` and the `check.sh` resolver the plugin runs after every agent write

## Gotchas

- `frame.ts` holds `checkFrame` apart from the runner in `run.ts`, because the runner reads the board scanner and its zod classic import would double the hook's start
- The browser rules run on the server and never in the hook, so an agent sees them through `check` with a server running and on the board, never in the turn of its write. With no headless shell the board says nothing, and `check` alone reports `browser-not-found`
- Every serve now launches Chromium for the startup sweep, and every e2e spec or capture case that reads a label count waits on `check` or `POST /api/checks` first, since a browser finding can land mid-assertion
- The browser comparison in `e2e/checks.spec.ts` never sets `color-scheme` itself, since that flips the default text color around a frame's fixed literal color and reads as two themes
- A project rule kind is added only when a real frame needs it, since a config language that grows ahead of need becomes the design tool Frameboard is not
