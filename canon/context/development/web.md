---
title: Landing page project
description: The public landing page in web/, a second project with its own package, lockfile, and gate
---

# Landing page project

## Overview

Owns the `web/` folder, apart from the board's own tooling in `canon/context/development/local.md`.

## Layout

### `web/`

Owns the public landing page, a second project with its own `package.json`, `bun.lock`, and gate, synced from canon's `astro` stack with the `base` layer skipped. The board's tooling never reads it.

- Run `bun install` and then `bun run check` inside `web/`, which gates typecheck, ESLint, oxfmt with Prettier for `.astro`, Vitest, and the static build
- The `build` script in `web/` ends on html-validate over `dist/index.html`, so markup the recommended preset refuses fails the build
- `bun run dev` inside `web/` serves the page on 4321 plus the worktree offset, and setting `ASTRO_DEV_BACKGROUND=0` keeps it in the foreground of the shell that started it
- `web/.lintstagedrc` takes over staged files under `web/`, since root oxlint fails to load the nested `web/.oxlintrc.json`
- `.oxlintrc.json`, `.prettierignore`, and the `exclude-paths` entry in `release-please-config.json` keep root lint, format, and releases off the folder
