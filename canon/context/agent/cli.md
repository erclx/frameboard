---
title: CLI
description: The commands agents run, the docs verb, the frameboard skill, and the plugin hook
---

# CLI

## Overview

Owns the agent interface, being every verb an agent or script runs, the `docs` verb that prints the facts about them, and the `frameboard` skill, check hook, and inbox monitor shipped as a Claude Code plugin. Anything the mouse does on the board, a verb does too.

## Layout

### `src/cli/`

Owns the program and the conventions every verb shares, with `index.ts` bundled to `dist/cli.js` and `hook.ts` to `dist/hook.js`, the check hook's own entry.

- Every verb takes `--json` and `--root`, exits with a stable code, and never prompts, because an agent cannot answer a prompt
- With `--json`, stdout carries one envelope, `{ ok, data }` or `{ ok, error }`, even on a parse error, and each error code keeps one exit in `src/shared/errors.ts`
- A page ref is `<page>` or `<project>/<page>`, a frame ref adds `/<frame>`, and an argument ending in `.html` is the frame file itself
- A verb given no project takes the board's only project, else fails `project-required`, since guessing would write to the wrong one
- Every `edit` refusal exits 7 with its reason as the code, so a script tells a refused edit from a missing frame

### `src/cli/commands/`

Owns one module per verb group, with flags and JSON shapes in `frameboard docs`. `selection`, `notes`, `inspect`, `check`, and `capture` report, `edit` sets one property on one element leaving every other byte alone, and `editing` claims frames.

- `serve` records its address in the board folder, and a second `serve` on a live board prints that address with `reused: true` and binds nothing
- A fresh `serve` waits up to one second for an old writing tab to reconnect, and opens one only when no writing tab is connected, so `opened` is true exactly when this call opened one
- The tab `serve` opens carries a single-use redeem URL, never in the JSON envelope's `url`, and a tab typed in by hand reads but cannot write
- `show` points every open board tab at a frame and exits 3 with `server-not-running` rather than start a server
- `project`, `page`, and `frame` add, duplicate, rename, move, and delete, and `duplicate` and `move` take a target page in any project
- `move` with `--x` and `--y` and no `--to` writes `layout.json` alone, so a move never collides with an agent rewriting the file

### `plugins/frameboard/`

Owns the `frameboard` skill, the check hook, and the inbox monitor.

- The skill holds judgment and carries no verb table or rule list, so it cannot drift from the installed tool, and `docs` holds the facts
- The skill follows the Agent Skills format and the hook is a thin call into a CLI entry, so another agent needs only its own manifest
- The monitor runs `inbox --follow`, and Claude Code hands each line to the session as an event, so a sent note is acted on at once with no MCP server
- The board sends a note to the session holding the frame's claim, else the only listening session, else it asks
- A claim is cooperative: another live session's claim is refused as occupied, it expires after five minutes unless renewed, and the file hash still guards a hand edit

## Gotchas

- The inbox monitor starts with `when: "always"`, because with `on-skill-invoke` it never started in the spike
- Claude Code runs plugin monitors only in interactive sessions and not on Bedrock, Google Cloud, or Foundry, where a sent note waits as a pinned one
- `fit` sets height only, and a frame whose content is too wide is reported, leaving the widening to the agent
- The hook runs the installed check directly, preferring Bun and never a package runner, which costs about ten times the check on every write
- `--no-open` opens nothing on either `serve` path, which is how tests, `preview`, and capture run, so a test never launches a browser on the developer's screen
