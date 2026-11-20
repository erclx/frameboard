---
title: CI
description: GitHub Actions workflow triggers and checks
---

# CI

## Overview

Owns the GitHub Actions workflows that gate a merge. Pull requests targeting `main` run the checks and all but macOS must pass, a push to `main` runs the release workflow, Verify, and every check in `frameboard-checks.yml`, and `workflow_dispatch` runs any workflow. The checks call package scripts, covered in `canon/context/development/local.md`.

## Layout

### `.github/workflows/`

Owns the merge checks, the release, and the landing page deploy. `verify.yml` holds the golden jobs a sync writes and runs on pushes to `main` for the README's Verify badge, and `frameboard-checks.yml` holds the project's own jobs, which a sync leaves alone.

| Check                       | Workflow                | Command                                                                   | What it asserts                                                                                                      |
| --------------------------- | ----------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Static Checks               | `verify.yml`            | `bun run typecheck`, `bun run lint`, `bun run check:format`               | tsc, oxlint with zero warnings, and oxfmt are clean                                                                  |
| Unit Tests                  | `verify.yml`            | `bun run test:coverage`                                                   | the Vitest `node` project passes, with coverage                                                                      |
| Build                       | `verify.yml`            | `bun run build`                                                           | Vite builds the client and rolldown bundles `dist/cli.js`                                                            |
| E2E Tests                   | `verify.yml`            | `bun run test:e2e --project=chromium` with `DIST_PREBUILT`                | Playwright passes against the built CLI the Build job uploaded                                                       |
| Browser Component Tests     | `frameboard-checks.yml` | `bunx vitest run --project browser`                                       | the Vitest `browser` project passes in headless Chromium                                                             |
| CLI on Node and Bun         | `frameboard-checks.yml` | `node` and `bun` on `dist/cli.js --version`                               | the bundle runs on both runtimes from outside the checkout                                                           |
| Edit Writer on Node and Bun | `frameboard-checks.yml` | `property.test.ts` under `bunx vitest` and `bun --bun vitest`, then `cmp` | the edit property run passes and writes the same output digest on both runtimes                                      |
| macOS Unit and CLI Smoke    | `frameboard-checks.yml` | `bunx vitest run --project node`, then `bash scripts/smoke-cli.sh dist`   | the `node` project passes on Apple Silicon, and `serve`, the structure verbs, and `check` run from an outside bundle |
| Landing Page Gate           | `frameboard-checks.yml` | `bun run check` in `web/`                                                 | the landing page typechecks, lints, formats, passes its unit tests, builds to valid HTML, and embeds no long code    |

The workflows the table leaves out own releases, labels, and the landing page.

- `release-please.yml` owns the release pull request and the npm publish, checking `NPM_TOKEN` before it cuts a tag and refusing a tag whose `dist/cli.js --version` differs
- `deploy.yml` publishes `web/dist` to the `frameboard` Pages project under the branch's name, skips with a notice until the Cloudflare secrets exist, and deletes a closed pull request's previews
- `phase-label-gate.yml` fails a pull request carrying a phase label, board reference, or session link, and `pr-local-preview.yml` owns the evidence preview
- `canon/config/config.json` records `verify.yml` and `deploy.yml` as customized, so a sync keeps the trigger and the `web/` build, and a push or dispatch run keys its group on `github.run_id`
- `frameboard-checks.yml` also runs on a push to `main`. Its macOS job runs there and on dispatch only, with no browser or E2E layer, so a macOS-only break shows after the merge

### `canon/config/`

Holds the config the ship chain and the toolkit read, beside the sync record in `config.json`.

- `pr-labels.toml` maps paths to the labels `git-pr` puts on a pull request, and `canon labels audit` names any surface no row reaches
- `painted.json` counts `src/client/**/*.ts` as painted, so a client logic change with no capture or waiver refuses `canon pr lift`, but not its test-only `fixtures.ts` and `*-harness.tsx`
- `preview.json` and `app-drive.toml` feed the preview copy and the drives, which `canon/context/development/local.md` and `canon/context/development/capture-scripts.md` cover

## Gotchas

- The browser project runs in `frameboard-checks.yml` and not in `unit-tests`, which installs no browser
- No `canon tooling sync` writes `release-please.yml`, so a later fix to canon's copy reaches this one only by hand
- `initial-version` is `0.0.1` so a `0.0.0` manifest never cuts `1.0.0`, and `bump-minor-pre-major` lands a breaking change on 0.x as a minor bump
- Release-please skips a commit only when every file it touches is excluded, so a commit pairing `canon` or `.claude` with `src/` or `plugins/` still releases
- `.prettierignore` carries `/CHANGELOG.md`, because oxfmt rejects the changelog release-please writes and a sync overwrites `.oxfmtrc.json`
