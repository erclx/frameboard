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

- `serve` with no `--root` reuses the board the walk finds, else creates `.frameboard/` in the working folder, even in a repository. `--root` names the board folder itself for every verb.
- `serve` reads `dist/client` from source and the `client` folder beside a built bundle, and exits 3 with `client-not-built` when it holds no `index.html`. A live board's reuse skips the check.
- `serve` records its address in the board folder, and a second `serve` on a live board prints that address with `reused: true` and binds nothing
- A fresh `serve` waits up to one second for an old writing tab to reconnect, and opens one only when no writing tab is connected, so `opened` is true exactly when this call opened one

### `src/cli/commands/open.ts`

Owns handing a tab write access, beside `show.ts` and `selection.ts`, the other verbs that need a live server. A tab gets write access only through a single-use redeem URL.

- The tab `serve` opens carries a redeem URL, never in the JSON envelope's `url`, and a tab typed in by hand reads but cannot write
- `open` mints one through the bearer-only ticket route and opens it unless `--no-open`, returning `writeUrl` and `expiresAt` and never the address token
- `open` and `show` exit 3 with `server-not-running` rather than start a server, and `show` sends every open board tab a frame, which each tab then jumps to or offers to jump to by its own state
- `selection` prints what the last writing tab reported selecting, the element in the address `edit --index --hash` takes, and exits 3 with `server-not-running` when no server holds one

### `src/cli/commands/frame.ts`

Owns the frame verbs, and `project.ts` and `page.ts` reshape projects and pages the same way.

- `project`, `page`, and `frame` add, duplicate, rename, move, and delete, and `duplicate` and `move` take a target page in any project
- `project tokens` writes a starter token sheet the way the guide's look step does, and exits 4 with `tokens-exist` rather than write under a sheet that already reaches the project
- `move` with `--x` and `--y` and no `--to` writes `layout.json` alone, so a move never collides with an agent rewriting the file
- `frame add` leaves every axis no size names hugging, a preset or `--width` fixing the width, and writes the box it places as a stand-in until `serve` measures
- `frame resize` fixes each axis it sets, and `frame fit` sets the height to the content and turns `hugHeight` on, the inverse of that resize

### `src/cli/inbox/`

Owns the follower `inbox --follow` runs, apart from `commands/` since it holds a long-lived loop rather than a verb. The program reads flags positionally, so `notes` keeps its flags apart from `reply` and `done`.

- It upgrades the live socket with the address token as a bearer, and the hub takes an `inbox` hello from no other socket, the board's cookie included, so a browser page never registers as a listener
- It waits quietly for a board and a server and retries every 500 ms like a board tab, printing nothing until a note arrives
- It sends `claude · ` and the project folder's name as its tag, and the server shows a session id's first 6 characters instead when two listeners share one
- It acks a note only after printing it, so one killed between the two prints it again on its next start, and acking first would lose it instead
- `notes`, `notes reply`, and `notes done` write `notes.json` with no server, and `inbox` defaults `--session` to `CLAUDE_CODE_SESSION_ID`

### `plugins/frameboard/`

Owns the `frameboard` skill, the check hook, and the inbox monitor, with `lib/resolve.sh` the install lookup the hook and the monitor share.

- The lookup takes the project's `node_modules` install, then its own `dist/` when its `package.json` names `frameboard`, then the install on PATH, so the checkout checks itself

- The skill holds judgment and carries no verb table or rule list, so it cannot drift from the installed tool, and `docs` holds the facts
- The skill follows the Agent Skills format and the hook is a thin call into a CLI entry, so another agent needs only its own manifest
- The monitor runs `inbox --follow`, and Claude Code hands each line to the session as an event, so a sent note is acted on at once with no MCP server
- The board sends a note to the claim holder while it listens, else to the only listener, else to a new session when nobody listens and `serve` can start one, else to the one the developer picks

`editing` writes `.run/claims.json` under the record lock with no server, and `--release` drops one claim or all of the session's. The claim is also what names the agent on the board's change toast. Its `--session` and `--agent` default to `CLAUDE_CODE_SESSION_ID` and `claude` through `src/cli/session.ts`, which `notes` and `inbox` share.

- A claim is cooperative, so another live session's claim refuses `frame-claimed` with exit 4, and it lapses five minutes after the last `editing`
- A new frame is written before `frame add` places it, since `add` writes a blank skeleton when no file exists, and it is not claimed, since nothing else holds a file just written
- The developer's hand edit on a held frame waits in the board until the claim drops, and the server refuses one sent anyway

## Gotchas

- The inbox monitor starts with `when: "always"`, because with `on-skill-invoke` it never started in the spike
- Claude Code runs plugin monitors only in interactive sessions and not on Bedrock, Google Cloud, or Foundry, where a sent note waits as a pinned one
- `frame fit` sets height only, at the layout width, ignores what a cropping ancestor hides, and reports too-wide content. It refuses `fit-unbounded` for content sized off the viewport, like `100vh`
- The hook runs the installed check directly, preferring Bun and never a package runner, which costs about ten times the check on every write
- `--no-open` opens nothing on either `serve` path, which is how tests, `preview`, and capture run, so a test never launches a browser on the developer's screen
