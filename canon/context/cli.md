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
- `show <frame>` points the open board at a frame
- `list` shows projects, pages, and frames
- `docs` prints verbs, flags, record shapes, the content format, and the check list

In a folder with no board, `serve` creates `.frameboard/` with one empty project. It reuses a board tab already connected to the server and opens one in the browser only when none is connected, unless `--no-open` is passed.

### Managing projects, pages, and frames

- `project add`, `rename`, and `delete` manage projects
- `page add`, `duplicate`, `rename`, `move`, and `delete` manage pages, where `move` reorders
- `frame add`, `duplicate`, `move`, `resize`, `fit`, `order`, `rename`, and `delete` manage frames, and `frame hide` and `frame lock` set or clear those flags

`fit` sets a frame's height to its content, and `order` sets its stacking order. `duplicate` and `move` take a target page, in any project, which is how copy and cut-and-paste reach the CLI.

### Reading the developer

- `selection` reports what the developer selected, being project, page, every selected frame, and element
- `notes` lists the developer's pinned notes, replies in a note's thread, and marks one done
- `inbox --follow` prints each note the board sends to this session as one line, and never exits while the session lives. The plugin's monitor runs it.

### Reading and editing frames

- `inspect` reports a frame's rendered elements as data, being each one's document-order index, rendered size, and computed color and type, under the same addresses the inspector and `edit` use
- `edit` sets one property on one element and leaves every other byte alone
- `editing` claims, releases, or lists claims on frames
- `check` reports every content rule a frame, page, or project breaks
- `capture` screenshots a frame or a page

## Decisions

### Every verb is scriptable

Every verb takes `--json` and `--root`, takes `--project` where a project applies, exits with a stable code, and never prompts. An agent cannot answer a prompt.

### The skill holds judgment and `docs` holds facts

The skill covers the loop of reading `frameboard docs`, starting or reusing the board, claiming a frame, writing it, fixing every check finding, verifying both themes, respecting the developer's hand edits, and capturing to confirm. It carries no verb table and no rule list, so it cannot drift from the installed tool. A second skill appears only when a second job does.

### Claims are cooperative

A claim on a frame another live session holds is refused as occupied, naming the session and when the claim expires. A claim expires after five minutes unless renewed. Nothing blocks a raw file write, and the file hash still protects a hand edit.

### The skill and hook stay portable

The skill follows the Agent Skills format with nothing Claude-only in it, and the hook is a thin call into a CLI entry that reads the hook payload on stdin. Another agent then needs only its own manifest, since Codex and Cursor both read Agent Skills.

### A sent note reaches the running session

The plugin declares a monitor that runs `inbox --follow` for the whole session, and Claude Code hands each line it prints to the session as an event, waking it when idle. So a note sent from the board is acted on at once with no MCP server.

The monitor's process carries the session id, and the board sends a note to the session holding the frame's claim, else the only listening session, else it asks. An agent without the plugin reads the same notes through `notes`. Track `07-agent-channel` measured the route.

### No Claude rules ship

A rule only reminds the agent. The check after every write holds whether or not the agent remembers.

## Gotchas

- The inbox monitor starts with `when: "always"`. With `on-skill-invoke` it never started in the spike.
- Claude Code runs plugin monitors only in interactive sessions and not on Bedrock, Google Cloud, or Foundry, where a sent note waits as a pinned one.
- `fit` sets height only. A frame whose content is too wide is reported, and widening it is the agent's call.
- The hook runs the installed check directly, preferring Bun, never through a package runner, since a runner costs about ten times the check on every write.
