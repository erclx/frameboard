---
title: For your agent
description: Commands, content checks, claims, change marks, and the Claude Code plugin
---

# For your agent

The commands, checks, claims, and plugin a coding agent works with on the board.

## Commands

The `project`, `page`, and `frame` commands manage the board on disk, and `list` shows it. `show` marks several frames, or a page, for the toast to step through and points the open board at the first, or offers Go while you are mid-action or it sits in another project.

- `edit` changes one style, attribute, or text on one element without touching another byte, and `--drop-attr` removes an attribute, such as a boolean `muted`, that `--attr` can only set
- `remove` takes one element and everything inside it out of a frame, given the `--index` and `--hash` that `inspect` reports, and refuses with exit 7 once the file has changed
- `capture` writes PNGs of a frame or page in either theme at 1x to 3x with `--scale`, naming a scaled file `<frame>.<theme>@<n>x.png`, and `--scroll <px>` shoots a scroll frame that far down
- `capture` holds each video on its poster, or on its first frame without one, so two captures match. A video with no picture is listed under its image's `videos` as `error` or `pending` and never refuses the capture.
- `capture --at 0,500,1000` holds a frame's motion at each moment in ms and writes `<frame>.at-<ms>.<theme>.png` apiece, and `--filmstrip <n>` writes one image of n moments spaced from start to end. Both seek `window.__hf` when the page sets it, then `window.__timelines`, then its CSS animations and transitions, and refuse `motion-missing` for a scene a script steps on a timer.
- `frame add` with no size makes a frame that hugs its content, which a running server measures once it is placed and after each write, and `frame fit` sets a height to its content and keeps it hugging
- `inspect` lists each rendered element with the index `edit` takes, its box, and its computed color and type
- `preview <frame>` prints a link and a code that open the frame's project on a phone on the same Wi-Fi, read only, and `preview --stop` ends it
- `frameboard docs` prints every command, flag, record shape, and exit code

A page meant to scroll, such as one with a sticky section, takes `--scroll` on `frame add` or `frame resize`, which holds it at a screen height rather than its full length. A frame already fixed taller than a screen keeps its height, so pass `--height` with the resize.

A responsive page is one frame file shown at several widths, so every fix to the file lands at all of them.

- `--widths 834,390` on `frame add` or `frame resize` draws the frame again at each width, in a row beside it
- Each width hugs its content when the frame does and holds its device height otherwise
- `capture` names each width's image `<frame>@<width>.<theme>.png`, and a browser finding at a width prints as `<path>@<width>`

`frame device <frame-ref> phone`, or `--device phone` on `frame add`, has the board draw a generic phone around the frame, and `tablet` a tablet. The frame file and its size stay as they are, and `none` clears it.

`page transition <page-ref> fade` sets what the board draws between a page's slides while presenting, one of `none`, `fade`, `slide`, `push`, `zoom`, `flip`, and `dissolve`. `frame transition <frame-ref> zoom` sets one slide's own, and `page` in place of a name returns it to its page's.

- `--ms` sets the length from 100 to 5000, and `--direction left`, `right`, `up`, or `down` applies to `slide` and `push` alone
- Both write `layout.json` and never a frame's file
- An element marked `data-step="2"` appears on the second press while presenting, with `data-step-effect` of `appear`, `fade`, `fly`, `wipe`, or `zoom`, and `frameboard edit --attr` writes each
- `data-step-start` of `with` shows a step alongside the one before it and `after` right behind it, and everywhere but present mode every step shows

`references sync <folder>` fills a folder of design references from the frames its `frames.json` maps, and `--check` exits 14 when the folder has drifted. It needs `oxfmt` installed in that project or beside Frameboard, an optional peer, and prints the install command without it.

## Content checks

`frameboard check` reports every content rule a frame breaks, such as a link outside its page folder or colors set for one theme alone, and exits 8 on any error. With `--json` the findings sit under `data.findings` whether it passes or fails.

- An error means the frame renders wrong or cannot load, and a warning means it renders and a style call is in question, such as a generic font. `frameboard docs` prints each rule's level.
- The board runs the same rules on each change, and a frame's findings mark opens the list. Any error draws it as a filled red badge, and warnings alone as a grey dot and a count
- A finding in a stylesheet the frame links names that file beside its line
- A running server adds the rules only a browser can see, such as clipped content, an inner scrollbar, dropped CSS, and a sticky effect in a frame that never scrolls
- A running server also warns when an agent's write changes a rule that an element's own `style` attribute overrides, since that element keeps the value you may have set by hand

A project turns off a rule that does not fit it, an error rule included.

- List the rule's id in `checks.off` of the project's `project.json`, such as `"off": ["generic-font"]`
- A rule turned off is silent on the board, in `check`, and in the plugin hook
- Each finding's card on the board carries a Turn off button that writes that key for the frame's project
- Undo, or a hand edit of the file, turns the rule back on

## Claims

An agent runs `editing` on a frame before rewriting it.

- The board then outlines the frame and tags it with the agent and how long it has held it, and a second session that tries to claim it is told it is taken
- A claim lapses five minutes after the agent last ran `editing`, and a note sent from a claimed frame goes to the session holding it
- When you move, resize, edit, rename, or delete a claimed frame, your edit waits until the claim ends, under a card naming the agent
- A move or resize then goes only if the agent left the frame as you saw it, and a rename or delete goes once the claim ends
- An element edit goes if the agent left that element alone, and otherwise comes back, with typed text kept in the Text field to apply again

Before writing new frames, an agent reserves them with `editing --new`, one call for the whole set.

- The board draws each as a hatched box where it will land, in one row past the page's frames, naming the agent and its place in the set
- The frame the agent turned to last reads drawing and the rest read queued, and each box becomes its frame when the file lands
- Renewing any frame in the set keeps the whole set, so it lapses together five minutes after the agent's last `editing`
- Adding or renaming a frame onto a reserved name waits for the reservation to end, since the agent's file would replace yours
- Right-click a box and choose Release reservation to free the space for a frame of your own

## Change marks and following

When an agent writes a frame, the board marks it with a dot and counts it on its page and project until you look at it.

- A toast names the agent and offers Show, or `\`, which takes you to the change and makes the edited elements glow, and Next, or `]`, steps to the next one
- Once several frames changed, Mark all seen, or `⇧]`, clears every page at once, and the toast offers Undo for 5 seconds after
- The browser tab's title opens with how many changes and agent note replies you have not seen yet, such as `(3) landing-v2 · Frameboard`
- The compare button on a changed frame's label flips it to the version before the agent's run, or splits it at a divider you drag
- The server keeps that version until 200 later changes land

You can also watch an agent work as it goes.

- Click a listening agent's initial in the inspector header to follow it
- The board then pans to each frame it claims or writes, across pages, until you pan, zoom, or click the canvas yourself

## Plugin

The Claude Code plugin in `plugins/frameboard/` runs the static checks after each agent write and hands the findings back in the same turn.

- Its monitor runs `inbox --follow` for the session, so a sent note reaches the agent at once
- Its skill is `frameboard:draw`, and a session hook warns the agent when the installed CLI and the plugin are different versions
