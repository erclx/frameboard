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

The command prints the address it serves on, which is `http://127.0.0.1:4173` unless you pass `--port`. Open it in a browser to see the board. `frameboard --version` prints the installed version.

## How it works

Frameboard has no hosted service and no MCP server. The design is a folder of HTML files on your disk, which an agent writes and the board renders as real web pages, so animation, video, and interaction work as they would in a browser. Frameboard keeps no private copy of them.

The server binds to `127.0.0.1` alone, so the board never leaves your machine. Releases before 1.0 ship the board in stages. Today the package carries the `serve` command and the board's shell, and the board folder, the agent commands, and the content checks arrive in later 0.x releases.

## Requirements

Frameboard runs on Node 22 or later, or on Bun.

## Links

- [Contributing guide](CONTRIBUTING.md) for setup, tests, and the commit rules
- [Security policy](SECURITY.md) for reporting a vulnerability privately
- [Issue tracker](https://github.com/erclx/frameboard/issues)
- [MIT license](LICENSE)
