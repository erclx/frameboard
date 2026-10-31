---
title: For your agent
description: Commands, content checks, claims, change marks, and the Claude Code plugin
---

# For your agent

The commands, checks, claims, and plugin a coding agent works with on the board.

## Commands

The `project`, `page`, and `frame` commands manage the board on disk, and `list` shows it.

- `edit` changes one style, attribute, or text on one element without touching another byte
- `show` points the open board at a frame, or offers Go while you are mid-action or it sits in another project, and `capture` writes PNGs of a frame or page in either theme at 1x to 3x with `--scale`, naming a scaled file `<frame>.<theme>@<n>x.png`
- `frame add` with no size makes a frame that hugs its content, which a running server measures once it is placed and after each write, and `frame fit` sets a height to its content and keeps it hugging
- `inspect` lists each rendered element with the index `edit` takes, its box, and its computed color and type
- `frameboard docs` prints every command, flag, record shape, and exit code

## Content checks

`frameboard check` reports every content rule a frame breaks, such as a link outside its page folder or colors set for one theme alone, and exits 8 on any error.

- An error means the frame renders wrong or cannot load, and a warning means it renders and a style call is in question, such as a generic font. `frameboard docs` prints each rule's level.
- The board runs the same rules on each change, and a frame's findings badge, red for an error and amber for warnings alone, opens the list, which the inspector shows too
- A finding in a stylesheet the frame links names that file beside its line
- A running server adds the rules only a browser can see, being clipped content, an inner scrollbar, content sized off the viewport, text under a project's minimum size, and dropped CSS
- A running server also warns when an agent's write changes a rule that an element's own `style` attribute overrides, since that element keeps the value you may have set by hand

## Claims

An agent runs `editing` on a frame before rewriting it.

- The board then outlines the frame and tags it with the agent and how long it has held it, and a second session that tries to claim it is told it is taken
- A claim lapses five minutes after the agent last ran `editing`, and a note sent from a claimed frame goes to the session holding it
- When you move, resize, edit, rename, or delete a claimed frame, your edit waits until the claim ends, under a card naming the agent
- A move or resize then goes only if the agent left the frame as you saw it, and a rename or delete goes once the claim ends
- An element edit goes if the agent left that element alone, and otherwise comes back, with typed text kept in the Text field to apply again

## Change marks and following

When an agent writes a frame, the board marks it with a dot and counts it on its page and project until you look at it.

- A toast names the agent and offers Show, or `\`, which takes you to the change and makes the edited elements glow, and Next, or `]`, steps to the next one
- Once several frames changed, Mark all seen, or `⇧]`, clears every page at once, and the toast offers Undo for 5 seconds after
- The compare button on a changed frame's label flips it to the version before the agent's run, or splits it at a divider you drag
- The server keeps that version until it restarts or 200 later changes land

You can also watch an agent work as it goes.

- Click a listening agent's initial in the inspector header to follow it
- The board then pans to each frame it claims or writes, across pages, until you pan, zoom, or click the canvas yourself

## Plugin

The Claude Code plugin in `plugins/frameboard/` runs the static checks after each agent write and hands the findings back in the same turn.

- Its monitor runs `inbox --follow` for the session, so a sent note reaches the agent at once
- Its skill is `frameboard:draw`, and a session hook warns the agent when the installed CLI and the plugin are different versions
