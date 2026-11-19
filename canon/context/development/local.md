---
title: Local workflow
description: Local dev workflow, scripts, and husky hooks
---

# Local workflow

## Overview

Owns how the project runs on a developer machine, being the toolchain, the scripts that verify a change, and the git hooks that run them. CI calls the same scripts, covered in `canon/context/development/ci.md`, and the test folders and the test lock are in `canon/context/development/testing.md`.

Setup is Bun and the `canon` CLI from `bun add -g @erclx/canon`, which the pre-commit hook calls, then `bun install` to activate the hooks, then `bunx playwright install chromium`.

## Layout

### Scripts

These gate a change, and `bun run check` is the one the pre-push hook runs.

| Command                            | Purpose                                                                                                |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `bun run check`                    | Gates locally and writes nothing, running typecheck, lint, format, unit tests, build, and `canon gate` |
| `bun run check:full`               | Runs `check`, then `test:e2e`                                                                          |
| `bun run typecheck`                | Runs `tsc --noEmit` over `src/`, `e2e/`, and the root configs                                          |
| `bun run lint`, `bun run lint:fix` | Runs oxlint with zero warnings allowed, and auto-fixes its issues                                      |
| `bun run format`                   | Auto-fixes oxfmt formatting                                                                            |
| `bun run build`                    | Builds the client into `dist/client/` with Vite, then `dist/cli.js` and `dist/hook.js` with rolldown   |

Three conditions sit behind those commands.

- The `canon gate` stage fails a document past 300 rendered lines, a code file past 2000 lines, and a comment run past its cap in a file the branch touches, and `canon gate run` prints each finding
- The CLI run from source writes its faces into `node_modules/.cache/frameboard/faces` on first use, and a `bun install` that moves a face package leaves that cache stale
- The board needs `bun run build` outside `dev`, since a source `serve` refuses without `dist/client`, and an old build serves the old board

These serve the board and run the test layers.

| Command                    | Purpose                                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `bun run preview`          | Serves `basic` under `CANON_PREVIEW_ROOT` (unset: committed board) at `PREVIEW_PORT`, 4173, and prints an edit link |
| `bun run dev`              | Hot-reloads the client on 5173 over its own board on 6173, both offset per worktree, passing Vite's `Origin` alone  |
| `bun run test`             | Runs Vitest in watch mode                                                                                           |
| `bun run test:run`         | Runs both Vitest projects, `node` and `browser`, once on half the cores, under the test lock                        |
| `bun run test:coverage`    | Runs the `node` project with coverage, as CI's unit-tests job does                                                  |
| `bun run test:e2e`         | Runs Playwright on the built CLI at a per-worktree port, locally on a quarter of the cores, under the test lock     |
| `bun run test:e2e:changed` | Runs Playwright on specs the import graph reaches from the current diff, under the test lock                        |

Two of those need a companion command or variable.

- Point `preview` or `dev` at a drive copy with `CANON_PREVIEW_ROOT=<copyRoot>` from `canon pr drive-copy --json`. Unset, `preview` serves the committed board and `dev` a temporary copy of it.
- Run the edit writer's tests on Bun with `bun --bun vitest run --project node src/server/edit`, adding `FRAMEBOARD_EDIT_DIGEST=<path>` to write the output digest

A running `preview` and the drive copy it serves carry these conditions.

- `canon pr drive-copy` rebuilds the copy but leaves its `.run/` alone, since `canon/config/preview.json` keeps that path, so a running `preview` keeps its address file and board key
- The rebuild copies the checkout as it stands, so the seeded pages and the reservation on `webapp/settings` reach the copy through the `seed` key, which runs `scripts/drive-seed.ts`
- The edit link from `preview` works once, so a late reader or a take opens `/api/access/open`, which a server reused from a bare `serve` answers with 404
- A claim lives in the ignored `.run/` and lapses after five minutes, so a drive renews it with `bun dist/cli.js editing <frame-ref> --root <copyRoot>/test/fixtures/boards/basic --session drive-review`
- The board port `dev` starts serves `src/client` unbuilt, so opening it directly gets a page that never loads, and only Vite's address works

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

### `scripts/`

Owns the shell scripts and the verify runner the commands above call, and every `.sh` file lives here but the plugin's resolver and `.claude/hooks/`.

- `dev.ts` starts the board from source on the port `vite.config.ts` proxies to, then Vite, and `preview.ts` runs the built CLI's `serve --open-route`, then `open --no-open`

- `worktree-port.sh` hashes a worktree's name into a port offset from 1 to 50, 0 being the main checkout, and `WORKTREE_PORT_OFFSET` breaks the 1 in 50 collision by hand
- `evidence-capture.sh` backs `screenshot` with a throwaway copy of `basic` at pinned file times, since a run in the fixture rewrites `notes.json` and leaves a change log
- `screenshot-compare.ts` serves its own boards through `e2e/support/board-server.ts`, so it reads the e2e helper from outside the runner's folder

### `.husky/`

Owns the git hooks.

- `pre-commit` runs `lint-staged`, being oxlint and oxfmt on staged code, oxfmt on JSON, CSS, and markdown, and `canon indexes regen` on markdown
- `commit-msg` runs `commitlint` against the conventional commit format
- `pre-push` runs `bun run check`, so a push fails on formatting drift until `bun run format` runs, since the hook writes nothing

### `web/`

Owns the public landing page, a second project with its own `package.json`, `bun.lock`, and gate, synced from canon's `astro` stack with the `base` layer skipped. The board's tooling never reads it.

- Run `bun install` and then `bun run check` inside `web/`, which gates typecheck, ESLint, oxfmt with Prettier for `.astro`, Vitest, and the static build
- The `build` script in `web/` ends on html-validate over `dist/index.html`, so markup the recommended preset refuses fails the build
- `bun run dev` inside `web/` serves the page on 4321 plus the worktree offset, and setting `ASTRO_DEV_BACKGROUND=0` keeps it in the foreground of the shell that started it
- `web/.lintstagedrc` takes over staged files under `web/`, since root oxlint fails to load the nested `web/.oxlintrc.json`
- `.oxlintrc.json`, `.prettierignore`, and the `exclude-paths` entry in `release-please-config.json` keep root lint, format, and releases off the folder

### Other folders

Test support and design references sit outside the folders above.

- `src/test/` owns the setup file the Vitest `browser` project loads, the board records client tests build from, and the contrast measures component tests read
- `src/test/` keeps its real pointer, key, motion, and contrast helpers in plain JavaScript, since a `.ts` import of `vitest/browser` fails typecheck
- `canon/design/` owns the accepted references, which only `references sync` writes, so `.prettierignore` and `.oxlintrc.json` keep it out of format and lint

## Gotchas

- `canon sync` writes `canon/config/config.json` in a shape oxfmt rejects, so run `bun run format` before the commit
- `vitest.config.ts` clears the `server.strictPort` from `vite.config.ts`, so parallel unit runs hop off a taken 63315 while `dev`, `preview`, and the e2e servers still fail on one
- `src/test/setup.ts` hands the frame port the test page's own, and `vitest.config.ts` strips the dev proxy, so a test frame gets vitest's 404 rather than a board
- `web/` has no Preflight, so a rule outside `@layer base` beats every utility, and `[hidden]` hides only through `global.css`
- Playwright never reuses a running server, and a `preview` on any port makes the e2e `serve` report `reused` and exit, so stop the preview before running specs
