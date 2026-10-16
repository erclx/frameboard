---
title: CLI
description: The commands agents run, the docs verb, the frameboard skill, and the plugin hook
---

# CLI

## Overview

Owns the agent interface, being every verb an agent or script runs, the `docs` verb that prints the facts about them, and the `frameboard` skill, check hook, and inbox monitor shipped as a Claude Code plugin. Anything the mouse does on the board, a verb does too.

## Layout

- `src/cli/` owns the verbs
- `plugins/frameboard/` owns the `frameboard` skill, the check hook, and the inbox monitor

Flags and JSON shapes come from `frameboard docs`, not from here.

### Starting and showing the board

- `serve` starts the server for one board folder and records its address in the folder, so another session reuses it
  - In a folder with no board it creates `.frameboard/` with one empty project
  - It reuses a board tab already connected to the server and opens one only when none is connected, unless `--no-open` is passed
  - A second `serve` for a board whose recorded server answers its health check prints that server's address with `reused: true` and binds nothing, so two sessions on one board share one server
- `show <frame>` points every open board tab at a frame, switching to its page and zooming to it, and exits 3 with `server-not-running` when no server serves the board
- `list` shows projects, pages, and frames
- `docs` prints verbs, flags, record shapes, the content format, and the check list

### Managing projects, pages, and frames

- `project add`, `rename`, and `delete` manage projects
- `page add`, `duplicate`, `rename`, `move`, and `delete` manage pages, where `move` reorders
- `frame add`, `duplicate`, `move`, `resize`, `fit`, `order`, `rename`, and `delete` manage frames, and `frame hide` and `frame lock` set or clear those flags
  - `fit` sets a frame's height to its content, and `order` sets its stacking order
  - `duplicate` and `move` take a target page in any project, which is how copy and cut-and-paste reach the CLI
  - `move` with `--x` and `--y` and no `--to` sets the position alone, writing `layout.json` and never the frame, so a move never collides with an agent rewriting the file

### Reading the developer

- `selection` reports what the developer selected, being project, page, every selected frame, and element
- `notes` lists the developer's pinned notes, replies in a note's thread, and marks one done
- `inbox --follow` prints each note the board sends to this session as one line and never exits while the session lives, which is what the plugin's monitor runs

### Reading and editing frames

- `inspect` reports a frame's rendered elements as data, being each one's document-order index, rendered size, and computed color and type, under the same addresses the inspector and `edit` use
- `edit` sets one property on one element and leaves every other byte alone
  - It takes `--index`, an optional `--hash`, and one of `--style`, `--attr`, or `--text`, and returns the file's new hash
- `editing` claims, releases, or lists claims on frames
- `check` reports every content rule a frame, page, or project breaks
- `capture` screenshots a frame or a page

## Decisions

### Opening a tab is the server's call

- A fresh `serve` waits up to one second for a tab left by the server before it to reconnect, so a restarted server finds that tab rather than opening a second one beside it.
- A second `serve` asks the running server to open a tab, which it does only with no board tab connected, so `opened` is true exactly when this call opened a browser tab.
- `--no-open` opens nothing on either path, which is how the end to end suite, `preview`, and capture run, since a test run must never launch a browser on the developer's screen.
- `show` never starts a server, because launching a long-lived process as a side effect would break the rule that no verb needs a running server.

### Every verb is scriptable

- Every verb takes `--json` and `--root`, and `--project` where a project applies
- Every verb exits with a stable code and never prompts, because an agent cannot answer a prompt

### One envelope and a fixed exit per error

- With `--json`, stdout carries exactly one envelope, `{ ok, data }` or `{ ok, error }`, even on a parse error, so an agent tells success from failure by one key before reading the exit code.
- Each error code maps to one exit in `src/shared/errors.ts`, and a later row appends a code rather than reusing a number, so a script branching on an exit keeps working.
- Every `edit` refusal exits 7 with its reason as the code, so a script tells a refused edit from a missing frame.

### Refs name what the agent just wrote

- A page ref is `<page>` or `<project>/<page>`, and a frame ref adds `/<frame>`, so a short ref works on a one-project board.
- An argument ending in `.html` is a path to the frame file, so an agent names a frame by the file it just wrote.
- A verb given no project takes the board's only project and otherwise fails `project-required`, since guessing between projects would write to the wrong one.

### The skill holds judgment and `docs` holds facts

- The skill covers the loop of reading `frameboard docs`, starting or reusing the board, claiming a frame, writing it, fixing every check finding, verifying both themes, respecting hand edits, and capturing to confirm
- It carries no verb table and no rule list, so it cannot drift from the installed tool
- A second skill appears only when a second job does

### Claims are cooperative

- A claim on a frame another live session holds is refused as occupied, naming the session and when the claim expires
- A claim expires after five minutes unless renewed
- Nothing blocks a raw file write, and the file hash still protects a hand edit

### The skill and hook stay portable

- The skill follows the Agent Skills format with nothing Claude-only in it
- The hook is a thin call into a CLI entry that reads the hook payload on stdin
- Another agent then needs only its own manifest, since Codex and Cursor both read Agent Skills

### A sent note reaches the running session

- The plugin declares a monitor that runs `inbox --follow` for the whole session
- Claude Code hands each line it prints to the session as an event, waking it when idle, so a sent note is acted on at once with no MCP server
- The monitor's process carries the session id, and the board sends a note to the session holding the frame's claim, else the only listening session, else it asks
- An agent without the plugin reads the same notes through `notes`
- Track `07-agent-channel` measured the route

### No Claude rules ship

- A rule only reminds the agent, while the check after every write holds whether or not the agent remembers

## Gotchas

- The inbox monitor starts with `when: "always"`, because with `on-skill-invoke` it never started in the spike
- Claude Code runs plugin monitors only in interactive sessions and not on Bedrock, Google Cloud, or Foundry, where a sent note waits as a pinned one
- `fit` sets height only, and a frame whose content is too wide is reported, leaving the widening to the agent
- The hook runs the installed check directly, preferring Bun, never through a package runner, since a runner costs about ten times the check on every write
