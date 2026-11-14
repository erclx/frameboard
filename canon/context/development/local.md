---
title: Local workflow
description: Local dev workflow, scripts, and husky hooks
---

# Local workflow

## Overview

Owns how the project runs on a developer machine, being the toolchain, the scripts that verify a change, and the git hooks that run them. CI calls the same scripts, covered in `canon/context/development/ci.md`.

Setup is Bun and the `canon` CLI from `bun add -g @erclx/canon`, which the pre-commit hook calls, then `bun install` to activate the hooks, then `bunx playwright install chromium`.

## Layout

### Scripts

These gate a change, and `bun run check` is the one the pre-push hook runs.

| Command                            | Purpose                                                                                                                |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `bun run check`                    | Gates locally and writes nothing, running typecheck, lint, format, unit tests, build, markdown bans, and embedded code |
| `bun run check:full`               | Runs `check`, then `test:e2e`                                                                                          |
| `bun run typecheck`                | Runs `tsc --noEmit` over `src/`, `e2e/`, and the root configs                                                          |
| `bun run lint`, `bun run lint:fix` | Runs oxlint with zero warnings allowed, and auto-fixes its issues                                                      |
| `bun run format`                   | Auto-fixes oxfmt formatting                                                                                            |
| `bun run build`                    | Builds the client into `dist/client/` with Vite, then `dist/cli.js` and `dist/hook.js` with rolldown                   |

The CLI run from source needs no build for its faces. It writes them into `node_modules/.cache/frameboard/faces` on first use, and a `bun install` that moves a face package leaves that cache stale. The board needs `bun run build` outside `dev`, since a source `serve` refuses without `dist/client`, and an old build serves the old board.

These serve the board and run the test layers.

| Command                    | Purpose                                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `bun run preview`          | Serves `basic` under `CANON_PREVIEW_ROOT` (unset: committed board) at `PREVIEW_PORT`, 4173, and prints an edit link |
| `bun run dev`              | Serves the client with hot reload on 5173, proxying to its own board on 6173, both plus the worktree offset         |
| `bun run test`             | Runs Vitest in watch mode                                                                                           |
| `bun run test:run`         | Runs both Vitest projects, `node` and `browser`, once on half the cores, under the test lock                        |
| `bun run test:coverage`    | Runs the `node` project with coverage, as CI's unit-tests job does                                                  |
| `bun run test:e2e`         | Runs Playwright on the built CLI at a per-worktree port, locally on a quarter of the cores, under the test lock     |
| `bun run test:e2e:changed` | Runs Playwright on specs the import graph reaches from the current diff, under the test lock                        |

Two of those need a companion command or variable.

- Point `preview` or `dev` at a drive copy with `CANON_PREVIEW_ROOT=<copyRoot>` from `canon pr drive-copy --json`. Unset, `preview` serves the committed board and `dev` a temporary copy of it.
- Run the edit writer's tests on Bun with `bun --bun vitest run --project node src/server/edit`, adding `FRAMEBOARD_EDIT_DIGEST=<path>` to write the output digest

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

- `screenshot` leaves a committed image alone when at most 200 pixels differ and no channel moves past 64, so a smaller real change stays uncaptured
- Antialiased rounded corners land apart between runs on every panel, and no mask can hold them, which is what that tolerance absorbs
- `FRAMEBOARD_EVIDENCE_ROOT` sends `screenshot` evidence to that folder as captured, with no tolerance, and the committed set stays unread
- A painted change inside those limits writes its image with `FRAMEBOARD_EVIDENCE_ROOT=e2e/evidence SCREENSHOT_FILTER=<case> bun run screenshot`

The other two scripts carry one condition each.

- `screenshot:compare` builds first and serves its own boards
- `measure:canvas` sits outside the gate, because its number describes the developer's own browser and screen and a CI runner's says nothing about either

`design:sync` carries more conditions than the other capture scripts.

- `design:sync --check` passes the flag to the verb, which writes nothing and exits 14 on a changed, missing, or stray file
- It reads the design board at the main root's `.canon/board` from any worktree, through the path the script derives from `git rev-parse`
- The verb's formatter options live in `src/server/references/format.ts`, and `.oxfmtrc.json` no longer reaches a reference
- An oxfmt bump changes every reference's bytes, so the commit bumping it runs `design:sync` too

### `scripts/`

Owns the shell scripts and the verify runner the commands above call, and every `.sh` file lives here but the plugin's resolver and `.claude/hooks/`.

- `worktree-port.sh` hashes a linked worktree's name into a port offset from 1 to 50, leaving 0 for the main checkout
- Two worktrees collide on a port offset about 1 time in 50, so set `WORKTREE_PORT_OFFSET` by hand to break the tie
- `screenshot-compare.ts` sits here and serves its own boards through `e2e/support/board-server.ts`, so it reads the e2e helper from outside the runner's folder
- `.prettierignore` and `.oxlintrc.json` keep `canon/design/` out of format and lint, since only `references sync` writes the folder

One script wraps the capture.

- `evidence-capture.sh` backs `screenshot` and wraps the synced `screenshot.sh`, serving a throwaway copy of `basic` with pinned file times
- A capture run in the fixture itself rewrites the tracked `notes.json` and leaves a change log the next run paints as unseen

Two scripts back the serving commands.

- `dev.ts` backs `bun run dev`, starting the board from source with `src/client` as its client, on the port the proxy in `vite.config.ts` names, and then Vite in front of it
- `preview.ts` backs `bun run preview`, running the built CLI's `serve --open-route` and then `open --no-open`, so it prints a once-only edit link and one fresh per open, and exits as its server does

### `.husky/`

Owns the git hooks.

- `pre-commit` runs `lint-staged`, being oxlint and oxfmt on staged code, oxfmt on JSON, CSS, and markdown, and `canon indexes regen` on markdown
- `commit-msg` runs `commitlint` against the conventional commit format
- `pre-push` runs `bun run check`, so a push fails on formatting drift until `bun run format` runs, since the hook writes nothing

### `e2e/`

Owns the Playwright specs, grouped by role into `cli/`, `agent-work/`, `hand-edits/`, and `shell/` with none at the root, the helpers under `e2e/support/`, the capture harness `e2e/screenshot.ts`, its cases under `e2e/capture/`, and the committed baseline under `e2e/evidence/`.

- A spec that writes board files serves its own copy of a fixture through `e2e/support/board-server.ts`, since writing into the committed fixture would leak between specs
- `playwright-core`, the one runtime dependency, is pinned to the version `@playwright/test` resolves, so bump both together
- A capture case picks its theme by saving `frameboard.theme` from an init script, since the board reads the choice before its first paint and a class added by hand is overwritten
- A capture case that writes the served board joins `WRITING_SECTIONS` in `e2e/capture/board.ts`, which runs it after the rest
- Those cases run last because a fresh browser paints the server's whole change log as unseen in every later case

Two helpers keep a spec off the board's timing.

- A spec presses undo through `e2e/support/history.ts`, which waits until the board counts the step, since an early press does nothing. Home reads Undo off the command palette.
- A spec reads the canvas and its layer through `e2e/support/canvas.ts`, since a page switch keeps a hidden canvas beside the live one

### `test/`

Owns the fixture boards under `test/fixtures/boards/` and the helpers under `test/support/`, and holds no tests itself, so unit tests, specs, and later rows read one copy.

- `.prettierignore` keeps oxfmt out of `test/fixtures/`, since a fixture's bytes are what its test asserts and the `broken` board holds JSON that does not parse
- The `capture` board names only generic families and a Geist face in its `assets/`, so it renders alike on Linux CI and macOS
- `basic`'s `marketing/states` page holds what a drive needs, with a Free text, shape, image, and video in `free`, and the sizes a corner drag writes in `sized`
- Its `colors` frame holds six tokens and one raw hex, whose `theme` finding is intended

### `web/`

Owns the public landing page, a second project with its own `package.json`, `bun.lock`, and gate, synced from canon's `astro` stack with the `base` layer skipped. The board's tooling never reads it.

- Run `bun install` and then `bun run check` inside `web/`, which gates typecheck, ESLint, oxfmt with Prettier for `.astro`, Vitest, and the static build
- The `build` script in `web/` ends on html-validate over `dist/index.html`, so markup the recommended preset refuses fails the build
- `bun run dev` inside `web/` serves the page on 4321 plus the worktree offset, and setting `ASTRO_DEV_BACKGROUND=0` keeps it in the foreground of the shell that started it
- `web/.lintstagedrc` takes over staged files under `web/`, since root oxlint fails to load the nested `web/.oxlintrc.json`
- `.oxlintrc.json`, `.prettierignore`, and the `exclude-paths` entry in `release-please-config.json` keep root lint, format, and releases off the folder

### Other folders

Test support that lives inside the source tree.

- `src/test/` owns the setup file the Vitest `browser` project loads, the board records client tests build from, and the contrast measure component tests read rendered colors with
- `src/test/motion.js` emulates reduced motion and `hover-contrast.js` reads contrast under the real pointer, in plain JavaScript since a `.ts` import of `vitest/browser` fails typecheck
- `src/test/real-pointer.js` moves that pointer on and off an element, for a `:hover` rule user-event never reaches, in plain JavaScript too
- `src/test/focus-ring.js` reads a focus ring's contrast after a real key press, since user-event's untrusted keys never reach a `:focus-visible` rule, in plain JavaScript for the same reason

## Gotchas

### Tooling

These catch the toolchain out.

- `canon tooling sync web . --write` overwrites the project's own `e2e/screenshot.ts`, `.oxlintrc.json`, and `commitlint.config.js`, so copy a stack file by hand instead
- `e2e/home.spec.ts` is a sync seed, so `canon/config/config.json` declines it and the spec lives at `e2e/shell/home.spec.ts`
- `canon sync` writes `canon/config/config.json` in a shape oxfmt rejects, so run `bun run format` before the commit
- `vitest.config.ts` clears the `server.strictPort` from `vite.config.ts`, so parallel unit runs hop off a taken 63315 while `dev`, `preview`, and the e2e servers still fail on one
- `vitest.config.ts` also strips the dev proxy before merging, so a browser test's frame iframe gets a 404 from vitest's own server rather than reaching whatever listens on 6173
- A cold faces cache under `node_modules/.cache/frameboard/` is safe to fill from parallel source runs, since `writeFaces` keeps a complete folder another run placed first

One catches the landing page out.

- `web/` has no Preflight, so a rule outside `@layer base` beats every utility, and `[hidden]` hides only through `global.css`

### Test lock

`scripts/test-locked.ts` holds one lock across every checkout on the machine, so a heavy run waits for another worktree's rather than starving it.

- `test:run`, `test:e2e`, and `test:e2e:changed` take it, at `~/Library/Caches/frameboard/test.lock` on macOS and under `${XDG_CACHE_HOME:-~/.cache}/frameboard/` on Linux
- A lock whose holder exited is taken over on the next poll, so delete the file by hand only when the waiting line names a live pid that runs no test
- `scripts/verify.ts` prints a phase's output once the phase exits, so a `check` or `pre-push` waiting on the lock looks hung until its run ends
- `canon tooling diff web .` marks seven scripts with `!`, being the project's forms to keep, and `--write` rewrites `lint`, `lint:fix`, and `screenshot`, so restore them after one

### Preview servers

These catch a running `preview` out.

- `canon pr drive-copy` rebuilds the copy but leaves its `.run/` alone, since `canon/config/preview.json` lists only that path under `keep`, so a running `preview` keeps its address file and board key
- `canon/config/app-drive.toml` carries the launch, data, and personas a drive reads, so a drive stops asking for them, and the skills read it and never write it
- The edit link from `preview` works once, so a late reader or a take opens `/api/access/open`, the config's `access`, and a reel edits what it is served
- A server `preview` reused from a bare `serve` lacks `--open-route`, so `/api/access/open` answers 404 there
- Playwright never reuses a running server, and a `preview` on any port makes the e2e `serve` report `reused` and exit, so stop the preview before running specs

Two catch a copy missing the seeded states.

- A rebuild copies the checkout as it stands, so the seeded pages reach the copy only when the `launch` line seeded the worktree's own fixture before the reviewer's `--baseline`
- The rebuild never copies `.run/` either, so the seed's reservation on `webapp/settings` is missing from a fresh copy

One catches a drive that needs a claimed frame.

- A claim lives in the ignored `.run/` and lapses after five minutes, so a drive renews it with `bun dist/cli.js editing <frame-ref> --root <copyRoot>/test/fixtures/boards/basic --session drive-review`

One catches a running `dev` out.

- The board port `dev` starts serves `src/client` unbuilt, so opening it directly gets a page that never loads, and only Vite's address works
