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
- `check` exits 8 with `check-findings` and the result in the error's details, so a script branches on the exit alone
- Exact rules read the parsed file, being `naming`, `dot-folder`, `head-body`, `table-tbody`, `outside-link`, `network`, and `missing-file`
- Selector rules read the cascade, being `default-font`, `generic-font`, and `theme`, plus `allowed-fonts` and `uppercase` only when `project.json` sets `checks.allowedFonts` or `checks.noUppercase`
- The cascade matches with css-select and weighs with `@bramus/specificity`, resolves custom properties per element, and reads token sheets ahead of the frame's own

### `src/cli/`

Owns the hook's entry, bundled to `dist/hook.js` beside the CLI.

- The hook prints `decision: "block"` with the findings as `reason`, which Claude Code places beside the tool result as feedback on that write
- It exits 0 and prints nothing for a non-frame write, a frame outside any board, a file gone since, and stdin that is not JSON, so a write is never reported as failed
- The bundle carries no commander, Hono, chokidar, ws, or zod, and a run cost a median 80 ms on Bun against a bare start of 17 ms. Measured at d609955 on 2026-10-17.

### `src/server/live/`

Owns the findings the board holds between watch batches.

- The server sends the whole findings map after the board on hello, then a partial map per batch where an empty list clears a frame
- A change to a token sheet or a project's `project.json` rechecks every frame it reaches, although neither reloads a frame

### Other folders

The plugin side of the hook sits outside `src/`.

- `plugins/frameboard/hooks/` owns `hooks.json` and the `check.sh` resolver the plugin runs after every agent write

## Gotchas

- `frame.ts` holds `checkFrame` apart from the runner in `run.ts`, because the runner reads the board scanner and its zod classic import would double the hook's start
- The browser rules, being clipping, scrollbars, minimum font size, and the viewport confirmation, run in a warm browser on the server and never in the hook
- The browser comparison in `e2e/checks.spec.ts` never sets `color-scheme` itself, since that flips the default text color around a frame's fixed literal color and reads as two themes
- A `--tokens` sheet outside the board is invisible to the hook until its path is recorded on disk, so the hook and the label can disagree on a frame leaning on it
- A project rule kind is added only when a real frame needs it, since a config language that grows ahead of need becomes the design tool Frameboard is not
