<p align="center">
  <img src="src/client/public/icon.svg" alt="Frameboard logo" width="64" height="64">
</p>

# Frameboard

A local design board that coding agents draw on as plain HTML files, and you review and tweak.

![Frameboard, a local design board for agents and developers](.github/social-card.png)

## Quick start

```bash
npx frameboard serve
```

In a folder with no board, `serve` creates `.frameboard/` with one empty project and opens the board at `http://127.0.0.1:4173`. Install it with `npm install -g frameboard` or `bun add -g frameboard`.

## What you get

- Agents draw by writing HTML files and running commands that print JSON, exit with stable codes, and never prompt
- Frames render as real web pages, so animation, video, and interaction work
- Every frame reloads the moment its file changes, in light and dark
- The files are the design, so Frameboard keeps no private copy and a hand edit touches only what changed
- The server binds to `127.0.0.1`, with no hosted service and no MCP server

## How it works

A board folder holds projects, a project holds pages, and a page holds frames. Each frame is one `.html` file beside a `layout.json` that records where it sits.

The `project`, `page`, and `frame` commands manage them on disk, `list` shows the board, and `edit` changes one style, attribute, or text on one element without touching another byte. `show` points the open board at a frame.

On the board, Cmd-click or double-click selects an element inside a frame, Enter, Esc, and Tab walk the tree, and the layers panel lists each frame's elements. `selection` prints what the developer picked, with the element's index and hash ready for `edit`.

Frames share one look through a `tokens.css` in the board folder, which a project's own `tokens.css` overrides, or through `serve --tokens <path>` for a sheet another tool manages. The server puts the sheets and three faces, Geist, Geist Mono, and Caveat, ahead of each frame's own styles as it serves the frame, and the file on disk stays as written. One toggle switches the board and every frame between light and dark.

`frameboard check` reports every content rule a frame breaks, such as a link outside its page folder or colors set for one theme alone, and exits 8 on any error. The board runs the same rules on each change, and a running server adds the rules only a browser can see, being clipped content, a scrollbar inside the frame, content sized off the viewport, and text under a project's minimum size. `capture` writes PNGs of a frame or page in either theme, `frame fit` sets a frame's height to its content, and `inspect` lists each rendered element with the index `edit` takes, its box, and its computed color and type.

Pin a note on a frame or one element with the Note tool, and Send hands it to a Claude Code session listening on the board. The agent answers in the note's thread through `notes reply` and closes it with `notes done`, and the notes stay in each page's `notes.json`.

An agent runs `editing` on a frame before rewriting it. The board then outlines the frame and tags it with the agent and how long it has held it, and a second session that tries to claim it is told it is taken. A claim lapses five minutes after the agent last ran `editing`, and a note sent from a claimed frame goes to the session holding it. When you move, resize, edit, rename, or delete a claimed frame, your edit waits until the claim ends, under a card naming the agent, and goes only if the agent left the frame as you saw it.

When an agent writes a frame, the board marks it with a dot and counts it on its page and project until you look at it. A toast names the agent and offers Show, which takes you to the change and makes the edited elements glow, and Next, or `]`, steps to the next one.

The Claude Code plugin in `plugins/frameboard/` runs the static checks after each agent write and hands the findings back in the same turn. Its monitor runs `inbox --follow` for the session, so a sent note reaches the agent at once. `frameboard docs` prints every command, flag, record shape, and exit code.

In the board you move and resize frames, add, rename, reorder, delete, and search pages, and add a frame at a phone, tablet, or desktop size with the Frame tool. On the home view, New project adds a project, and a card's right-click menu opens, renames, duplicates, or deletes one. The inspector edits a selected element's name, opacity, radius, type size, weight, alignment, fill, stroke color, shadow, and text, offers the project's tokens first, and flags a color no token names. The layers panel selects, renames, restacks, hides, and locks frames, and Cmd+D, Cmd+C, Cmd+X, and Cmd+V duplicate, copy, cut, and paste them across pages and projects. Cmd+F finds a frame, an element, or a line of copy on any page of the project and jumps to it. Undo any of it with Cmd+Z. An undo of something an agent has changed since is refused and named on the board, so it never reverts the agent's work. Releases before 1.0 ship the board in stages, and the rest of editing by hand arrives in later 0.x releases.

## Requirements

Frameboard runs on macOS and Linux, with Node 22 or later or with Bun. Windows support is planned.

`capture`, `frame fit`, and `inspect` render in Playwright's headless shell. Without it, they print the command that installs it and download nothing.

## Links

- [Contributing guide](CONTRIBUTING.md) for setup, tests, and the commit rules
- [Security policy](SECURITY.md) for reporting a vulnerability privately
- [Issue tracker](https://github.com/erclx/frameboard/issues)
- [MIT license](LICENSE)
