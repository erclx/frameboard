---
title: Local workflow
description: Local dev workflow, scripts, and husky hooks
---

# Local workflow

## Overview

Owns how the project runs on a developer machine, being the toolchain, the scripts that verify a change, and the git hooks that run them. CI calls the same scripts, covered in `canon/context/development/ci.md`. Setup is Bun, then `bun install`, which activates the hooks, then `bunx playwright install chromium`.

## Layout

### `scripts/`

| Command                                               | Purpose                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run check`                                       | Gates locally and writes nothing, running typecheck, lint, format, unit tests, build, and markdown bans                                                                                                                                                                                                   |
| `bun run check:full`                                  | Runs `check`, then `test:e2e`                                                                                                                                                                                                                                                                             |
| `bun run typecheck`                                   | Runs `tsc --noEmit` over `src/`, `e2e/`, and the root configs                                                                                                                                                                                                                                             |
| `bun run lint`, `bun run lint:fix`                    | Runs oxlint with zero warnings allowed, and auto-fixes its issues                                                                                                                                                                                                                                         |
| `bun run format`                                      | Auto-fixes oxfmt formatting                                                                                                                                                                                                                                                                               |
| `bun run build`                                       | Builds the client into `dist/client/` with Vite, then `dist/cli.js` and `dist/hook.js` with rolldown                                                                                                                                                                                                      |
| `bun run preview`                                     | Serves the built CLI on the `basic` fixture board at `PREVIEW_PORT`, default 4173, with no browser tab                                                                                                                                                                                                    |
| `bun run dev`                                         | Serves the client with hot reload on 5173, proxying to a `preview` on 4173 plus the worktree offset, run as `PREVIEW_PORT=$(bash scripts/worktree-port.sh 4173) bun run preview`                                                                                                                          |
| `bun run test`, `bun run test:run`                    | Runs Vitest in watch mode, and both projects, `node` and `browser`, once                                                                                                                                                                                                                                  |
| `bun run test:coverage`                               | Runs the `node` project with coverage, as CI's unit-tests job does                                                                                                                                                                                                                                        |
| `bun run test:e2e`                                    | Runs Playwright against the built CLI on a port offset per worktree                                                                                                                                                                                                                                       |
| `bun run test:e2e:changed`                            | Runs Playwright on specs the import graph reaches from the current diff                                                                                                                                                                                                                                   |
| `bun --bun vitest run --project node src/server/edit` | Runs the edit writer's tests on Bun, with `FRAMEBOARD_EDIT_DIGEST=<path>` to write the output digest                                                                                                                                                                                                      |
| `bun run measure:canvas`                              | Pans and pinches over fifty live frames in headed Chrome and prints p50, p95, and the share past 33 ms                                                                                                                                                                                                    |
| `bun run screenshot`                                  | Builds, serves, and captures every case in `e2e/capture/` into `screenshots/` and `e2e/evidence/`                                                                                                                                                                                                         |
| `bun run screenshot:compare`                          | Builds, then captures each shell surface at the references' 1440 by 900, light and dark, into `screenshots/compare/` from boards it serves itself                                                                                                                                                         |
| `bun run smoke:prod`                                  | Captures against `SCREENSHOT_BASE_URL`, failing on any console error                                                                                                                                                                                                                                      |
| `bun run design:sync`, `--check`                      | Captures the canvas frames `canon/design/index.md` carries into surface folders under `canon/design/`, or with `--check` fails on a changed frame or kit file and on a missing or stray file, warns on a PNG whose bytes differ, and writes nothing, and needs the `canon` CLI and the main root's canvas |

- `scripts/` owns the shell scripts and the verify runner the commands above call, and every `.sh` file lives here but the plugin's resolver and `.claude/hooks/`
- `worktree-port.sh` hashes a linked worktree's name into a port offset from 1 to 50, leaving 0 for the main checkout
- `design-sync.ts` writes `canon/design/` and nothing in `src/` imports it, so it is a dev script outside the gate, and `.prettierignore` and `.oxlintrc.json` keep the folder out of format and lint

### `.husky/`

Owns the git hooks.

- `pre-commit` runs `lint-staged`, being oxlint and oxfmt on staged code, oxfmt on JSON, CSS, and markdown, and `canon indexes regen` on markdown
- `commit-msg` runs `commitlint` against the conventional commit format
- `pre-push` runs `bun run check`, so a push fails on formatting drift until `bun run format` runs, since the hook writes nothing

### `e2e/`

Owns the Playwright specs, the helpers under `e2e/support/`, the capture harness `e2e/screenshot.ts`, its cases under `e2e/capture/`, and the committed baseline under `e2e/evidence/`.

- A spec that writes board files serves its own copy of a fixture through `e2e/support/board-server.ts`, since writing into the committed fixture would leak between specs
- `playwright-core`, the one runtime dependency, is pinned to the version `@playwright/test` resolves, so bump both together

### `test/`

Owns the fixture boards under `test/fixtures/boards/` and the helpers under `test/support/`, and holds no tests itself, so unit tests, specs, and later rows read one copy.

- `.prettierignore` keeps oxfmt out of `test/fixtures/`, since a fixture's bytes are what its test asserts and the `broken` board holds JSON that does not parse
- The `capture` board names only generic families and a Geist face in its `assets/`, so it renders alike on Linux CI and macOS

## Gotchas

- A `canon tooling sync web . --write` clobbers `e2e/screenshot.ts`, so restore its `./capture` import, `CASES: CaptureCase[] = CAPTURE_CASES`, and `EVIDENCE_ROOT` line, delete `readme-screenshot.yml`, and run `bun run format`, since the sync writes `config.json` oxfmt rejects
- Two worktrees collide on a port offset about 1 time in 50, so set `WORKTREE_PORT_OFFSET` by hand to break the tie
- `vitest.config.ts` clears `server.strictPort` that `vite.config.ts` sets, so vitest's browser server hops to a free port when 63315 is taken and parallel unit runs share a machine, while `dev`, `preview`, and the e2e servers keep failing loud on a taken port
- `vitest.config.ts` also strips the dev proxy `vite.config.ts` sets before merging, so a browser test's frame iframe gets a 404 from vitest's own server rather than reaching whatever listens on 4173
- Playwright never reuses a running server, and a `preview` on any port makes the e2e `serve` report `reused` and exit, so stop the preview before running specs
- `measure:canvas` sits outside the gate, because its number describes the developer's own browser and screen and a CI runner's says nothing about either
- A capture case picks its theme by saving `frameboard.theme` from an init script, since the board reads the choice before its first paint and a class added by hand is overwritten
