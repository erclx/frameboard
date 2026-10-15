---
title: CI
description: GitHub Actions workflow triggers and checks
---

# CI

## Overview

Owns the GitHub Actions workflows that gate a merge, being which events start a run and which checks have to pass before the branch can land. The checks call package scripts rather than defining commands of their own, so what each one runs is the subject of `canon/context/development/local.md`.

## Layout

- `.github/workflows/verify.yml` owns the golden verify jobs, which a `canon tooling sync` rewrites
- `.github/workflows/frameboard-checks.yml` owns the project's own jobs, which a sync never touches
- `.github/workflows/phase-label-gate.yml` and `.github/workflows/pr-local-preview.yml` own canon's pull request hygiene
- `.github/workflows/release-please.yml` owns releases, being the release pull request, the npm publish, and the check that the newest release reached npm. It reads `release-please-config.json` and `.release-please-manifest.json` at the root.

### Triggers

- Pull requests targeting `main` run the checks below
- A push to `main` runs the release workflow
- `workflow_dispatch` runs any workflow from the Actions tab, and a `tag` input on the release workflow publishes that tag alone

### Checks

- All jobs must pass before merge

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

- `bun run check` runs typecheck, lint, format, both Vitest projects, build, and the markdown ban scan, and writes nothing
- `bun run check:full` adds `bun run test:e2e`
- If CI fails on format, run `bun run format` locally and commit the diff

## Decisions

- The browser project runs in `frameboard-checks.yml` rather than in the golden `unit-tests` job. That job installs no browser, and a hand edit to `verify.yml` is reverted by the next sync.
- `test:coverage` runs only the `node` project, so the golden `unit-tests` job passes on a runner with no browser.

### Releases

The release workflow copies erclx/canon's, keeping its credential preflight, its queued `release-please` group, and its tag dispatch repair. No `canon tooling sync` writes it, so a later fix to canon's copy reaches this one by hand.

The publish job installs and builds the tag before it publishes, because the package ships only the gitignored `dist/`. Canon ships source and runs no build, so its job as written would publish a package that cannot run. The job also refuses a tag whose built `dist/cli.js --version` differs from the tag.

`initial-version` is `0.0.1` against a `0.0.0` manifest, since release-please reads a `0.0.0` entry as no release and otherwise cuts `1.0.0`. `bump-minor-pre-major` keeps a breaking change on 0.x at a minor bump. `bootstrap-sha` is the root commit rather than the branch point, so the first changelog carries a `feat` entry and a release pull request opens at all.

Publish Check passes with a notice while no GitHub release exists. It reads an npm E404 for the whole package as no versions, so a first publish that failed still names the repair command.

`.prettierignore` carries `/CHANGELOG.md`, because oxfmt rejects the changelog release-please writes and `canon tooling sync` overwrites `.oxfmtrc.json`.
