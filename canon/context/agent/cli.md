---
title: CLI
description: The commands agents run, the docs verb, the frameboard:draw skill, and the plugin hooks
---

# CLI

## Overview

Owns the agent interface, being every verb an agent or script runs, the `docs` verb that prints the facts about them, and the `frameboard:draw` skill, check and version hooks, and inbox monitor shipped as a Claude Code plugin. Anything the mouse does on the board, a verb does too.

## Layout

### `src/cli/`

Owns the program and the conventions every verb shares, with `index.ts` bundled to `dist/cli.js` and `hook.ts` to `dist/hook.js`, the check hook's own entry. A failing verb that still has a result, as `check` does, answers it as `data` beside `error`.

- Every verb takes `--json` and `--root`, exits with a stable code, and never prompts, because an agent cannot answer a prompt
- With `--json`, stdout carries one envelope, `{ ok, data }` or `{ ok, error }`, even on a parse error, and each error code keeps one exit in `src/shared/errors.ts`
- A page ref is `<page>` or `<project>/<page>`, a frame ref adds `/<frame>`, and an argument ending in `.html` is the frame file itself
- A verb given no project takes the board's only project, else fails `project-required`, since guessing would write to the wrong one
- Every `edit` and `remove` refusal exits 7 with its reason as the code, so a script tells a refused write from a missing frame

### `src/cli/commands/`

Owns one module per verb group, with flags and JSON shapes in `frameboard docs`. `selection`, `notes`, `inspect`, `check`, and `capture` report, `edit` sets one property on one element, or drops one attribute with `--drop-attr`, leaving every other byte alone, `remove` takes one element and its subtree out, and `editing` claims frames.

- `remove` needs `--index` and `--hash`, and like `edit` it writes with no server, so it checks no claim and journals nothing for undo. A note pinned on the removed element falls back to the frame
- `serve` with no `--root` reuses the board the walk finds, else creates `.frameboard/` in the working folder, even in a repository. `--root` names the board folder itself for every verb.
- `serve` reads `dist/client` from source and the `client` folder beside a built bundle, and exits 3 with `client-not-built` when it holds no `index.html`. A live board's reuse skips the check.
- `serve` records its address in the board folder, and a second `serve` on a live board prints that address with `reused: true` and binds nothing
- A fresh `serve` waits up to one second for an old writing tab to reconnect, and opens one only when no writing tab is connected, so `opened` is true exactly when this call opened one

### `src/cli/commands/open.ts`

Owns handing a tab write access, beside `show.ts`, `selection.ts`, and `preview.ts`, the other verbs that need a live server. A tab gets write access through a single-use redeem URL, or through the Edit button `serve --edit-button` offers.

- The tab `serve` opens carries a redeem URL, never in the JSON envelope's `url`, and a tab typed in by hand reads but cannot write
- `open` mints one through the bearer-only ticket route and opens it unless `--no-open`, returning `writeUrl` and `expiresAt` and never the address token, and `--ttl` takes 1 to 60 minutes
- `open`, `show`, and `preview` exit 3 with `server-not-running` rather than start a server, and `preview --stop` ends the phone link, per `canon/context/board/phone-clipboard.md`
- `show` takes several frame refs or page refs and logs a shown mark on each, which the change toast steps through, then sends every open board tab the first frame to jump to or offer by its own state
- `selection` prints what the last writing tab reported selecting, the element in the address `edit --index --hash` takes, and exits 3 with `server-not-running` when no server holds one

### `src/cli/commands/frame.ts`

Owns the frame verbs, `page.ts` reshaping pages the same way, both adding, duplicating, renaming, moving, and deleting, with the size, scroll, widths, device, and transition flags `frameboard docs` lists. `move --x --y` and `frame kit` write `layout.json` alone, so neither collides with an agent rewriting the file.

- `frame add` with no size, reserved box, or entry takes a trailing `-<px>` a size names as its width with the device on, through `onNamedWidth`, which the board's route never passes
- `frame fit` sets height only, reading at the layout width and that width's preset height or 900, never the frame's own, and ignores what a cropping ancestor hides
- `frame fit` refuses `fit-unbounded` for content sized off the viewport, like `100vh`, a block reset on `resize`, or one set once from `innerHeight`
- `frame fit` refuses `fit-scroll`, exit 10, on a `scroll` frame before the browser launches, while the board's Height row fits one by clearing `scroll`
- `frame fit` measures each linked width at its reference height and writes that height, with a shown phone's bar, beside the frame's, and reports content wider than the frame rather than widening it

### `src/cli/commands/project.ts`

Owns the project verbs, being add, rename, title, delete, the two filing verbs, and tokens. A project takes no duplicate or move from the CLI.

- `project group` and `project archive` file one project through `fileProjects`, the writer behind the board's filing routes, so the lock, the Edited time, and every other `project.json` key hold
- Unlike those routes, the verbs neither refuse a project another session holds nor journal the filing for undo
- `group` refuses a blank folder as `invalid-name`, since the writer reads one as a clear, and a call giving both or neither of a folder and `--clear` as `usage`
- `project title <name> <title>` sets a title in any characters through `retitleProject` and moves the folder to the name made from it, so the ref an agent passes next is the record's `name`
- `project tokens` writes a starter token sheet, and exits 4 with `tokens-exist` rather than write under a sheet that already reaches the project

### `src/cli/commands/kit.ts`

Owns `kit list`, `kit add`, `kit remove`, and `kit save`, over the same `src/server/kits/` the board's routes call, writing with no journal the way the other verbs do.

- `kit add <project> <kit>` takes a name `kit list` answers, and `--from <folder>` a kit folder resolved against the working folder in its place, refusing `usage` for both or neither
- `kit add` exits 4 with `name-taken` over a held kit, and `--replace` swaps in the copy under the held name, writing no `layout.json`, or adds the kit where none is held
- `kit remove <project> <kit>` answers the frames it cleared, and exits 3 with `kit-not-found` for a kit the project lacks

### `src/cli/commands/references.ts`

Owns `references sync <folder>`, which fills any folder holding a `frames.json` from the board, with the logic in `src/server/references/`. The verb names no consumer's paths, so a caller passes the folder and `--root`. It copies only what `frameLoads` finds inside `assets/`, so a file a script fetches at runtime stays out.

- A sync owns every file below the folder's first level and prunes what it would not write, while a top-level file stays the consumer's and never reads as stray
- Each project's loaded assets land in `assets/<project>/`, and a frame's links move there at the spans `frameLoads` locates, so a `<code>` sample naming `../assets/` keeps its bytes
- `--check` exits 14 on a changed, missing, or stray file and only warns on a PNG. A sync keeps an unchanged frame's PNG under `kept`, blind to token sheets and kits, so those owe `--rerender`
- The whole output builds before the first write, so a refusal leaves the folder as it was, whether an empty map, a frame the formatter cannot parse, or a frame loading a page-folder file
- oxfmt is an optional peer resolved beside the bundle, then from the folder, so an `npx` run finds a project's install, and its version is pinned because a bump changes every reference's bytes

### `src/cli/inbox/`

Owns the follower `inbox --follow` runs, apart from `commands/` since it holds a long-lived loop rather than a verb. The program reads flags positionally, so `notes` keeps its flags apart from `reply` and `done`.

- It upgrades the live socket with the address token as a bearer, and the hub takes an `inbox` hello from no other socket, the board's cookie included, so a browser page never registers as a listener
- It waits quietly for a board and a server and retries every 500 ms like a board tab, printing nothing until a note arrives
- It sends `claude · ` and the project folder's name as its tag, and the server shows a session id's first 6 characters instead when two listeners share one
- It acks a note only after printing it, so one killed between the two prints it again on its next start, and acking first would lose it instead
- `notes`, `notes reply`, and `notes done` write `notes.json` with no server, and `inbox` defaults `--session` to `CLAUDE_CODE_SESSION_ID`

### `src/cli/commands/editing.ts`

Owns claims, written into `.run/claims.json` under the record lock with no server, where `--release` drops each claim named or all of the session's. Its `--session` and `--agent` default to `CLAUDE_CODE_SESSION_ID` and `claude` through `src/cli/session.ts`, which `notes` and `inbox` share, and the claim names the agent on the board's change toast.

- A claim is cooperative, so another live session's claim refuses `frame-claimed` with exit 4, and it lapses five minutes after the last `editing`
- A new frame is reserved first with `editing <ref>... --new`, which refuses an existing frame as `name-taken`, and a plain `editing <ref>` or `--release` takes a reserved ref
- The set lands in one row past every frame and device body on its page unless `--x` or `--y` places it, sized by a flag or a `-<px>` name, and `frame add` with no position takes that box
- Two refs with neither `--new` nor `--release` refuse `usage`, so a single ref keeps its old arguments, `{ claim }` answer, and refusals
- The developer's hand edit on a held frame waits in the board until the claim drops, and the server refuses one sent anyway

### `plugins/frameboard/`

Owns the `frameboard:draw` skill in `skills/draw/`, the check hook, the version hook, and the inbox monitor, with `lib/resolve.sh` the install lookup they share. The skill holds judgment and no verb table, routes each feature to a file under `references/`, and says a `style` attribute outranks every rule.

- The lookup takes the project's `node_modules` install, then its own `dist/` when its `package.json` names `frameboard`, then PATH's, so the checkout checks itself
- The version hook compares `plugin.json` with the installed `--version` at `SessionStart` and prints only on a mismatch, a note that never orders a halt
- The skill follows the Agent Skills format and the hook is a thin call into a CLI entry, so another agent needs only its own manifest
- The monitor runs `inbox --follow`, and Claude Code hands each line to the session as an event, so a sent note is acted on at once with no MCP server
- The board sends a note to the claim holder while it listens, else to the only listener, else to a new session `serve` can start, else to the one the developer picks

## Gotchas

- The inbox monitor starts with `when: "always"`, because with `on-skill-invoke` it never started
- Claude Code runs plugin monitors only in interactive sessions and not on Bedrock, Google Cloud, or Foundry, where a sent note waits as a pinned one
- The hook runs the installed check directly, preferring Bun and never a package runner, which costs about ten times the check on every write
- `--no-open` opens nothing on either `serve` path, which is how tests, `preview`, and capture run, so a test never launches a browser
- A `frames.json` key is `<group>/<name>` or `<group>/<section>/<name>`, a fourth segment refusing `frame-map-invalid`, and `toReference` climbs one `../` per folder
