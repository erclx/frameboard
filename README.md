# Frameboard

A local design board that coding agents draw on as plain HTML files, and you review and tweak.

## Install

```bash
npm install -g frameboard
```

Bun works too, with `bun add -g frameboard`. To try it without installing, run `npx frameboard serve`.

## First run

```bash
frameboard serve
```

In a folder with no board, `serve` creates `.frameboard/` at the repository top, or in the current folder outside a repository, holding one empty project. It serves on `http://127.0.0.1:4173`, or on a free port when 4173 is taken, and opens the board in your browser unless you pass `--no-open` or a board tab is already connected. Running `serve` again for the same board prints the address of the server already running rather than starting a second, and opens a tab only when none is open.

The board opens on a home view listing every project. Opening one shows its pages and a canvas of its frames, each a live page you pan and zoom around, and a frame reloads on its own the moment its file changes on disk. `frameboard show <frame>` points the open board at a frame.

`frameboard docs` prints every command, flag, record shape, and exit code, and `frameboard --version` prints the installed version.

## How it works

Frameboard has no hosted service and no MCP server. The design is a folder of HTML files on your disk, which an agent writes and the board renders as real web pages, so animation, video, and interaction work as they would in a browser. Frameboard keeps no private copy of them.

A board folder holds projects, a project holds pages, and a page holds frames, each frame one `.html` file beside a `layout.json` that records where it sits. The `project`, `page`, and `frame` commands add, rename, move, and delete them on disk, and `list` shows the board. `edit` sets one inline style declaration, attribute, or text on one element of a frame and leaves every other byte of the file as it was. Every command takes `--json`, prints one JSON document, exits with a stable code, and never prompts, so an agent can script it.

`frameboard check` reports every content rule a frame, page, or project breaks, such as a link outside the frame's page folder, a font the browser picks by default, or colors set for one theme alone, and exits 8 on any finding. The board runs the same rules on every change it watches and marks a frame's label with its findings. The Claude Code plugin in `plugins/frameboard/` runs them after each agent write and hands the findings back in the same turn, along with the `frameboard` skill.

The server binds to `127.0.0.1` alone, so the board never leaves your machine. Releases before 1.0 ship the board in stages. Today the package carries the board folder, the structure commands, `edit`, `show`, the live board, and the content checks, and editing by hand in the board arrives in a later 0.x release.

## Requirements

Frameboard runs on Node 22 or later, or on Bun.

## Links

- [Contributing guide](CONTRIBUTING.md) for setup, tests, and the commit rules
- [Security policy](SECURITY.md) for reporting a vulnerability privately
- [Issue tracker](https://github.com/erclx/frameboard/issues)
- [MIT license](LICENSE)
