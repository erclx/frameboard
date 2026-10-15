---
title: Local workflow
description: Local dev workflow, scripts, and husky hooks
---

# Local workflow

## Overview

Owns how the project runs on a developer machine: installing the toolchain, the scripts that verify a change, and the git hooks that run them before a commit or a push leaves. CI calls the same scripts from a workflow, which is the subject of `canon/context/development/ci.md`.

## Layout

- `scripts/` owns the shell scripts and the verify runner the package scripts below call, all synced from canon's tooling stacks
- `.husky/` owns the git hooks
- `e2e/` owns the Playwright specs, the capture harness `e2e/screenshot.ts`, its cases under `e2e/capture/`, and the committed baseline under `e2e/evidence/`

### Setup

- Install [Bun](https://bun.sh): `curl -fsSL https://bun.sh/install | bash`
- Install dependencies: `bun install`, which also activates the hooks through husky's `prepare`
- Install the test browser: `bunx playwright install chromium`

### Scripts

| Command                    | Purpose                                                                                         |
| -------------------------- | ----------------------------------------------------------------------------------------------- |
| `bun run check`            | Gates locally and writes nothing: typecheck, lint, format, unit tests, build, markdown bans.    |
| `bun run check:full`       | Runs `check`, then `test:e2e`.                                                                  |
| `bun run typecheck`        | Run `tsc --noEmit` over `src/`, `e2e/`, and the root configs.                                   |
| `bun run lint`             | Run oxlint with zero warnings allowed.                                                          |
| `bun run lint:fix`         | Auto-fix oxlint issues.                                                                         |
| `bun run format`           | Auto-fix oxfmt formatting.                                                                      |
| `bun run build`            | Build the client into `dist/client/` with Vite, then bundle `dist/cli.js` with rolldown.        |
| `bun run preview`          | Serve the built CLI on `PREVIEW_PORT`, defaulting to 4173.                                      |
| `bun run test`             | Run Vitest in watch mode.                                                                       |
| `bun run test:run`         | Run both Vitest projects once, `node` and `browser`.                                            |
| `bun run test:coverage`    | Run the `node` project with coverage, as CI's unit-tests job does.                              |
| `bun run test:e2e`         | Run Playwright against the built CLI on a port offset per worktree.                             |
| `bun run test:e2e:changed` | Run Playwright on specs the import graph reaches from the current diff.                         |
| `bun run screenshot`       | Build, serve, and capture every case in `e2e/capture/` into `screenshots/` and `e2e/evidence/`. |
| `bun run smoke:prod`       | Capture against `SCREENSHOT_BASE_URL`, failing on any console error.                            |

### Shell scripts

All `.sh` files live under `scripts/`. Do not place shell scripts outside `scripts/`.

### Husky hooks

- `pre-commit` runs `lint-staged`: oxlint and oxfmt on staged code, oxfmt on JSON, CSS, and markdown, and `canon indexes regen` on markdown.
- `commit-msg` runs `commitlint` against the conventional commit format.
- `pre-push` runs `bun run check`. A push fails on formatting drift until `bun run format` runs, since the hook writes nothing.

## Gotchas

- `canon tooling sync web . --write` rewrites every golden config in place, records no per-file customization, and restores files a project deleted. After a sync, run `git diff` and repair three things:
  - Restore the three project edits in `e2e/screenshot.ts`, being the `./capture` import, `const CASES: CaptureCase[] = CAPTURE_CASES`, and the `EVIDENCE_ROOT` path line.
  - Delete the restored `.github/workflows/readme-screenshot.yml`.
  - Run `bun run format`, since the sync writes `canon/config/config.json` in a shape oxfmt rejects.
- `scripts/worktree-port.sh` hashes a linked worktree's name into an offset from 1 to 50, leaving 0 for the main checkout, so two worktrees collide about 1 time in 50. Set `WORKTREE_PORT_OFFSET` by hand to break the tie.
- Playwright never reuses a running server, so a port collision fails the run rather than testing another branch's code.
