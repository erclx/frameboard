---
title: Testing
description: The Playwright specs and capture harness, the fixture boards, and the test lock and time limit every heavy run takes
---

# Testing

## Overview

Owns where the tests and their fixtures live and how a heavy run shares the machine, being the Playwright specs and capture harness, the fixture boards, and the lock and time limit the test scripts take. The scripts themselves and the hooks that run them are in `canon/context/development/local.md`.

## Layout

### `e2e/`

Owns the Playwright specs, grouped by role into `cli/`, `agent-work/`, `hand-edits/`, and `shell/` with none at the root, the helpers under `e2e/support/`, the capture harness `e2e/screenshot.ts`, its cases under `e2e/capture/`, and the committed baseline under `e2e/evidence/`.

- A spec that writes board files serves its own copy of a fixture through `e2e/support/board-server.ts`, since writing into the committed fixture would leak between specs
- `playwright-core`, the one runtime dependency, is pinned to the version `@playwright/test` resolves, so bump both together
- A capture case picks its theme by saving `frameboard.theme` from an init script, since the board reads the choice before its first paint and a class added by hand is overwritten
- A capture case that writes the served board joins `WRITING_SECTIONS` in `e2e/capture/board/cases.ts`, which runs it after the rest
- Those cases run last because a fresh browser paints the server's whole change log as unseen in every later case

Three rules keep the capture sweep honest.

- A seeding helper counts as a write, so a case that seeds the board through one joins the list too
- The sweep fails a case outside the list when the served board already holds a change log, naming the case before it as the likely writer
- Each case waits about a second after the board's newest write before its page loads, since a watch reload mid-load stalls a case until the navigation times out

Two helpers keep a spec off the board's timing.

- A spec presses undo through `e2e/support/history.ts`, which waits until the board counts the step, since an early press does nothing. Home reads Undo off the command palette.
- A spec reads the canvas and its layer through `e2e/support/canvas.ts`, since a page switch keeps a hidden canvas beside the live one

### `test/`

Owns the fixture boards under `test/fixtures/boards/` and the helpers under `test/support/`, and holds no tests itself, so unit tests, specs, and later rows read one copy.

- `.prettierignore` keeps oxfmt out of `test/fixtures/`, since a fixture's bytes are what its test asserts and the `broken` board holds JSON that does not parse
- The `capture` board names only generic families and a Geist face in its `assets/`, so it renders alike on Linux CI and macOS
- `basic`'s `marketing/states` page holds what a drive needs, with an Absolute text, shape, image, and video in `free`, and the sizes a corner drag writes in `sized`
- Its `colors` frame holds six tokens and one raw hex, whose `theme` finding is intended

## Gotchas

### Test lock

`scripts/test-locked.ts` holds a lock of numbered slots across every checkout on the machine, so a heavy run waits while two others hold it rather than starving them.

- `test:run`, `test:e2e`, and `test:e2e:changed` take it, at `~/Library/Caches/frameboard/` on macOS and under `${XDG_CACHE_HOME:-~/.cache}/frameboard/` on Linux
- Slot one is `test.lock` and slot two `test.2.lock`. A wrapper from before slots takes `test.lock` alone, so a worktree on an older commit can overlap two newer runs until it rebases.
- A slot whose holder exited, even a wrapper ended by KILL, is taken over on the next poll, so delete a file by hand only when the waiting line names a live pid that runs no test
- `scripts/verify.ts` prints a phase's output once the phase exits, so a `check` or `pre-push` waiting on the lock looks hung until its run ends
- `canon tooling diff web .` marks seven scripts with `!`, being the project's forms to keep, and `--write` rewrites `lint`, `lint:fix`, and `screenshot`, so restore them after one

### Test time limit

The wrapper's settings, and the bound on a run that hangs, so a stuck run no longer holds a slot for good.

- `FRAMEBOARD_TEST_SLOTS` sets how many runs go at once, default 2, and `1` restores one at a time
- `FRAMEBOARD_TEST_LIMIT` bounds a run in seconds from when its command starts, default 900, 0 for none, and off when `CI` is set unless given
- At the limit the wrapper prints `killing '<command>' after the <n> s limit`, sends TERM to the command and every process it started, KILL to any left after 3 seconds, frees the slot, and exits 124
- The kill remembers each descendant it saw once a second by its start, read from `/proc` on Linux since a clock step moves `ps` lstart. A child whose parent exited before any poll survives.
- The browser project's 15 second test and 30 second hook timeouts run in the page, so a page that stops running never trips them, and the limit is the bound that holds then
