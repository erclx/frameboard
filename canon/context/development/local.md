---
title: Local workflow
description: Local dev workflow, scripts, and husky hooks
---

# Local workflow

## Overview

Owns how the project runs on a developer machine, being the toolchain, the scripts that verify a change, and the git hooks that run them. CI calls the same scripts, covered in `canon/context/development/ci.md`, and the test folders and the test lock are in `canon/context/development/testing.md`.

- The capture and measure scripts and a drive copy's preview are in `canon/context/development/capture-scripts.md`, and the `web/` folder is in `canon/context/development/web.md`.
- Setup is Bun and the `canon` CLI from `bun add -g @erclx/canon`, which the pre-commit hook calls, then `bun install` to activate the hooks, then `bunx playwright install chromium`.

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
