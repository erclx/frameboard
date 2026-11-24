---
title: Testing
description: The Playwright specs and capture harness, the fixture boards, and the test lock and time limit every heavy run takes
---

# Testing

## Overview

Owns where the tests and their fixtures live and how a heavy run shares the machine, being the Playwright specs and capture harness, the fixture boards, and the lock and time limit the test scripts take. The scripts themselves and the hooks that run them are in `canon/context/development/local.md`.

## Layout

### Scripts

`scripts/test-locked.ts` wraps `test:run`, `test:e2e`, and `test:e2e:changed` in a lock of numbered slots across every checkout on the machine, so a heavy run waits while others hold it rather than starving them. The slots are `test.lock` and `test.2.lock` in the user cache folder.

| Variable                | Purpose                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| `FRAMEBOARD_TEST_SLOTS` | How many runs go at once, default 2, where `1` restores one at a time                       |
| `FRAMEBOARD_TEST_LIMIT` | Seconds a run may take from its start, default 900, 0 for none, off under `CI` unless given |

The limit bounds a run that hangs, so a stuck run no longer holds a slot for good.

- At the limit the wrapper prints `killing '<command>' after the <n> s limit`, sends TERM to the command and every process it started, KILL to any left after 3 seconds, and exits 124
- The kill remembers each descendant it saw once a second by its start, read from `/proc` on Linux since a clock step moves `ps` lstart

`scripts/lib/tester-frame.ts` gives the browser project's provider a `frame()` that finds the running file's frame by its iframe id, since the provider's own can return the file before under load. `vitest.config.ts` wraps the provider in it until a Vitest upgrade fixes `frame()`.

`vitest.config.ts` also gives the browser project's `expect.poll` 5 seconds rather than Vitest's 1, since a frame's bridge can answer past 1 second on a loaded machine. The node project keeps the 1 second default.

### `e2e/`

Owns the Playwright specs by role in `cli/`, `agent-work/`, `hand-edits/`, and `shell/`, none at the root, the helpers in `e2e/support/`, the harness `e2e/screenshot.ts`, its cases under `e2e/capture/`, and the baseline in `e2e/evidence/`. A board-route load helper waits for `[data-layer]`, since the loading view's controls are inert.

- A spec that writes board files serves its own copy of a fixture through `e2e/support/board-server.ts`, since writing into the committed fixture would leak between specs
- `playwright-core`, the one runtime dependency, is pinned to the version `@playwright/test` resolves, so bump both together
- A capture case picks its theme by saving `frameboard.theme` from an init script, since the board reads the choice before its first paint and a class added by hand is overwritten
- A capture case writing the served board carries `writes: 'board'` and runs after every pristine case, since a later case paints its change as unseen, or `'assets'` to run last
- `e2e/support/history.ts` presses undo once the board counts the step, and `e2e/support/canvas.ts` reads the live canvas beside the hidden one a page switch keeps

### `e2e/agent-work/frame-isolation.spec.ts`

Holds the one test that runs a frame in a process of its own, as a desktop browser does, launching with `--site-per-process`.

- Playwright's headless shell isolates no site, so every other spec runs its frames in the board's process
- With sites isolated, Playwright's `boundingBox` and `click` inside a frame drop the canvas scale, so a spec needing either there reads the iframe's own box and scales by hand

### `test/`

Owns the fixture boards under `test/fixtures/boards/` and the helpers under `test/support/`, and holds no tests itself, so unit tests, specs, and later rows read one copy.

- `.prettierignore` keeps oxfmt out of `test/fixtures/`, since a fixture's bytes are what its test asserts and the `broken` board holds JSON that does not parse
- The `capture` board names only generic families and a Geist face in its `assets/`, so it renders alike on Linux CI and macOS
- `basic`'s `marketing/states` page holds what a drive needs, with an Absolute text, shape, image, and video in `free`, and the sizes a corner drag writes in `sized`
- Its `colors` frame holds six tokens and one raw hex, whose `theme` finding is intended

## Gotchas

- `scripts/verify.ts` prints a phase's output once the phase exits, so a `check` or `pre-push` waiting on the lock looks hung until its run ends
- A slot whose holder exited is taken over on the next poll, so delete a lock file by hand only when the waiting line names a live pid that runs no test
- A wrapper from before slots takes `test.lock` alone, so a worktree on an older commit can overlap two newer runs until it rebases
- A child whose parent exited before the kill's first poll survives it
- The browser project's 15 second test and 30 second hook timeouts run in the page, so a page that stops running never trips them and only the limit holds
