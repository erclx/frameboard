---
title: Local workflow
description: Local dev workflow, scripts, and husky hooks
---

# Local workflow

## Overview

Owns how the project runs on a developer machine, being installing the toolchain, the scripts that verify a change, and the git hooks that run them before a commit or a push leaves. CI calls the same scripts from a workflow, which is the subject of `canon/context/development/ci.md`.

## Layout

- `scripts/` owns the shell scripts and the verify runner the package scripts below call, all synced from canon's tooling stacks
- `.husky/` owns the git hooks
- `e2e/` owns the Playwright specs, the helpers they share under `e2e/support/`, the capture harness `e2e/screenshot.ts`, its cases under `e2e/capture/`, and the committed baseline under `e2e/evidence/`
- `test/` owns the fixture boards under `test/fixtures/boards/` and the helpers under `test/support/`, and holds no tests itself, so unit tests, specs, and later rows read one copy
- `.prettierignore` keeps oxfmt out of `test/fixtures/`, since a fixture's bytes are what its test asserts and the `broken` board holds JSON that does not parse

### Setup

- Install [Bun](https://bun.sh): `curl -fsSL https://bun.sh/install | bash`
- Install dependencies: `bun install`, which also activates the hooks through husky's `prepare`
- Install the test browser: `bunx playwright install chromium`

### Gate scripts

- `bun run check` gates locally and writes nothing, running typecheck, lint, format, unit tests, build, and markdown bans
- `bun run check:full` runs `check`, then `test:e2e`
- `bun run typecheck` runs `tsc --noEmit` over `src/`, `e2e/`, and the root configs
- `bun run lint` runs oxlint with zero warnings allowed, and `bun run lint:fix` auto-fixes its issues
- `bun run format` auto-fixes oxfmt formatting

### Build scripts

- `bun run build` builds the client into `dist/client/` with Vite, then bundles `dist/cli.js` with rolldown
- `bun run preview` serves the built CLI on the `basic` fixture board at `PREVIEW_PORT`, defaulting to 4173, with no browser tab
- `bun run dev` serves the client with hot reload on 5173 plus the worktree offset, proxying `/api`, the socket, and `/frames` to a `serve` on 4173 plus the offset, such as `PREVIEW_PORT=$(bash scripts/worktree-port.sh 4173) bun run preview`

### Test scripts

- `bun run test` runs Vitest in watch mode, and `bun run test:run` runs both projects, `node` and `browser`, once
- `bun run test:coverage` runs the `node` project with coverage, as CI's unit-tests job does
- `bun run test:e2e` runs Playwright against the built CLI on a port offset per worktree
- `bun run test:e2e:changed` runs Playwright on specs the import graph reaches from the current diff
- `bun --bun vitest run --project node src/server/edit` runs the edit writer's tests on Bun, and `FRAMEBOARD_EDIT_DIGEST=<path>` makes the property run write its output digest there for a comparison against Node

### Measurement script

- `bun run measure:canvas` builds, then pans and pinches over fifty live frames in headed Chrome and prints p50, p95, and the share of frames over 33 ms, failing past the smoothness bar.
- It sits outside the gate because the number describes the developer's own browser and screen, and a CI runner's figure says nothing about either.

### Capture scripts

- `bun run screenshot` builds, serves, and captures every case in `e2e/capture/` into `screenshots/` and `e2e/evidence/`
- `bun run smoke:prod` captures against `SCREENSHOT_BASE_URL`, failing on any console error

### Shell scripts

- All `.sh` files live under `scripts/`, and none go anywhere else

### Husky hooks

- `pre-commit` runs `lint-staged`, being oxlint and oxfmt on staged code, oxfmt on JSON, CSS, and markdown, and `canon indexes regen` on markdown
- `commit-msg` runs `commitlint` against the conventional commit format
- `pre-push` runs `bun run check`, so a push fails on formatting drift until `bun run format` runs, since the hook writes nothing

## Gotchas

- `canon tooling sync web . --write` rewrites every golden config in place, records no per-file customization, and restores files a project deleted. After a sync, run `git diff` and repair three things:
  - Restore the three project edits in `e2e/screenshot.ts`, being the `./capture` import, `const CASES: CaptureCase[] = CAPTURE_CASES`, and the `EVIDENCE_ROOT` path line.
  - Delete the restored `.github/workflows/readme-screenshot.yml`.
  - Run `bun run format`, since the sync writes `canon/config/config.json` in a shape oxfmt rejects.
- `scripts/worktree-port.sh` hashes a linked worktree's name into an offset from 1 to 50, leaving 0 for the main checkout, so two worktrees collide about 1 time in 50. Set `WORKTREE_PORT_OFFSET` by hand to break the tie.
- Playwright never reuses a running server, so a port collision fails the run rather than testing another branch's code
- A `preview` running on any port makes the e2e `serve` find it through the `basic` board's shared address file, report `reused`, and exit, so stop the preview before running specs
- A capture case that sets the chrome's `.dark` class from an init script waits for `DOMContentLoaded`. The script runs before `<html>` exists, and the frame silently comes out light.

### Specs that write board files

- A spec that writes board files serves its own copy of a fixture through `e2e/support/board-server.ts`, since writing into the committed fixture the shared `webServer` serves would leak between specs.
