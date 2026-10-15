---
title: CI
description: GitHub Actions workflow triggers and checks
---

# CI

## Overview

Owns the GitHub Actions workflows that gate a merge: which events start a run, and which checks have to pass before the branch can land. The checks call package scripts rather than defining commands of their own, so what each one runs is the subject of `canon/context/development/local.md`.

## Layout

- `.github/workflows/verify.yml` owns the golden verify jobs, which a `canon tooling sync` rewrites
- `.github/workflows/frameboard-checks.yml` owns the project's own jobs, which a sync never touches
- `.github/workflows/phase-label-gate.yml` and `.github/workflows/pr-local-preview.yml` own canon's pull request hygiene

### Triggers

- Pull requests targeting `main`
- `workflow_dispatch` (manual run from the Actions tab)

### Checks

All jobs must pass before merge.

| Check                   | Workflow                | Command                                                     | What it asserts                                                      |
| ----------------------- | ----------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------- |
| Static Checks           | `verify.yml`            | `bun run typecheck`, `bun run lint`, `bun run check:format` | tsc, oxlint with zero warnings, and oxfmt are clean                  |
| Unit Tests              | `verify.yml`            | `bun run test:coverage`                                     | the Vitest `node` project passes, with coverage                      |
| Build                   | `verify.yml`            | `bun run build`                                             | Vite builds the client and rolldown bundles `dist/cli.js`            |
| E2E Tests               | `verify.yml`            | `bun run test:e2e --project=chromium` with `DIST_PREBUILT`  | Playwright passes against the built CLI the Build job uploaded       |
| Browser Component Tests | `frameboard-checks.yml` | `bunx vitest run --project browser`                         | the Vitest `browser` project passes in headless Chromium             |
| CLI on Node and Bun     | `frameboard-checks.yml` | `node` and `bun` on `dist/cli.js --version`                 | the bundle runs on both runtimes from outside the checkout           |
| Phase Label Gate        | `phase-label-gate.yml`  | `canon labels scan`                                         | no phase label, board reference, or session link in the pull request |

### Running CI locally

`bun run check` runs typecheck, lint, format, both Vitest projects, build, and the markdown ban scan, and writes nothing. `bun run check:full` adds `bun run test:e2e`. If CI fails on format, run `bun run format` locally and commit the diff.

## Decisions

- The browser project runs in `frameboard-checks.yml` rather than in the golden `unit-tests` job. That job installs no browser, and a hand edit to `verify.yml` is reverted by the next sync.
- `test:coverage` runs only the `node` project, so the golden `unit-tests` job passes on a runner with no browser.
