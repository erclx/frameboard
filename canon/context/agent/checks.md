---
title: Checks
description: The content rules Frameboard enforces, the three paths that run them, and a project's own rules
---

# Checks

## Overview

Owns the content rules and where they run. A frame that breaks one is reported without anyone remembering to check, both to the agent straight after its write and on the frame's label on the board.

## Layout

- `src/server/checks/` owns the rules, the cascade they read, and the runner over a frame, a page, or a project, importing only `src/shared/` and its libraries so the hook bundles it without the server.
- `src/server/checks/frame.ts` holds `checkFrame` apart from the page and project runner in `run.ts`, because the runner reads the board scanner and its zod classic import would double the hook's start.
- `src/cli/hook.ts` is the hook's entry, bundled to `dist/hook.js` beside the CLI, and `src/cli/hook-reply.ts` turns a hook payload into the reply it prints.
- `src/server/live/findings.ts` holds the board's findings between watch batches, so a board tab's hello needs no check.
- `plugins/frameboard/hooks/` owns `hooks.json` and the `check.sh` resolver the plugin runs after every agent write.

### Exact rules

- **Naming:** `naming` reports a page or frame name `isValidName` refuses, read from the path alone, so the verbs and the check agree.
- **Dot folders:** `dot-folder` reports a folder opening with a dot inside a project, through `check` on the project alone, since the scanner skips it and no label exists.
- **Implied markup:** `head-body` reports a stated `<head>` with no `<body>`, and `table-tbody` a table whose rows the parser had to wrap, while a `thead`-only table passes.
- **Links:** `outside-link` reports a load resolving outside the page folder and the project's `assets/`, by realpath too, so a sibling page's sheet or a symlink out of the project is a finding.
- **Loads:** `network` reports a scheme or protocol-relative load while a navigation `a href` passes, and `missing-file` a local load whose file is gone.

### Selector rules

- **Fonts:** `default-font` reports text no rule gives a family, and `generic-font` text whose first family is a generic keyword, one finding per frame per family.
- **Theme:** `theme` reports a frame setting a literal color with no second theme, which a `[data-theme]` selector, a `prefers-color-scheme` query, or `light-dark()` supplies.
- **Project rules:** `allowed-fonts` and `uppercase` run only when `project.json` sets `checks.allowedFonts` or `checks.noUppercase`, and absent config means the built-in rules alone.

### The cascade

- css-select matches each rule over the htmlparser2 adapter tree and `@bramus/specificity` weighs it, because the groundwork spike's hand-rolled specificity was wrong on six of nine selectors.
- Custom properties resolve per element down the tree, so a scoped `--font` override reads differently from the one on `:root`.
- The browser's monospace for `code` and `pre` and its control font for form controls are seeded, since neither inherits the page's font.
- `tokenSheets` reads `<board>/tokens.css` and then `<board>/<project>/tokens.css` ahead of the frame's own sheets, so the frame's rule wins a tie as injection order makes it win.
- Every rule inside a media query counts as applying, because a frame renders at one viewport the check cannot see.

## Decisions

### Three paths, one rule set

- The `check` verb, the server on every watched batch, and the plugin hook after every agent write all run `checkFrameIn`, so no path can drift from another.
- `check` exits 8 with `check-findings` and the `CheckResult` in the error's details, so a script branches on the exit alone.
- The server sends the whole findings map after the board on hello, and after each batch's `board` a partial map where an empty list clears a frame.
- A change to a token sheet or a project's `project.json` rechecks every frame it reaches, although neither reloads a frame.

### The hook answers in the same turn

- The hook prints `decision: "block"` with the findings as `reason`, which Claude Code places beside the tool result as feedback on that write.
- It exits 0 and prints nothing for a non-frame write, a frame outside any board, a file gone since, and stdin that is not JSON, so a write is never reported as failed.
- `check.sh` finds `dist/hook.js` in the project's `node_modules`, else beside `frameboard` on `PATH`, and runs it with Bun when present, never a package runner.
- The bundle carries no commander, Hono, chokidar, ws, or zod, and at `d609955` a run cost a median 80 ms on Bun and 139 ms on Node against bare starts of 17 and 76 ms.

### A project rule kind is added only when a real frame needs it

- The kinds in hand cover the house styles seen so far, so a minimum font size waits for the browser rules rather than growing the config ahead of need.
- A config language that grows ahead of need becomes the design tool Frameboard is not.

## Gotchas

- The browser rules, being clipping, scrollbars, minimum font size, and the viewport confirmation, are M5's and run in a warm browser on the server, never in the hook.
- `e2e/checks.spec.ts` compares the font and theme rules with Chromium on the `cascade` fixture everywhere, and on a private corpus only where `FRAMEBOARD_CORPUS` names its board folder.
- The browser comparison toggles `data-theme` and the color-scheme media query but never sets `color-scheme` itself, since that flips the default text color around a frame's fixed literal color and reads as two themes.
- A `--tokens` sheet outside the board is invisible to the hook until its path is recorded on disk, so the hook and the label can disagree on a frame leaning on it.
