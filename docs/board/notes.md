---
title: Notes
description: Pinning a note on a frame or element and sending it to a listening agent
---

# Notes

Notes carry a request from you to an agent, pinned where it applies.

Pin a note on a frame or one element with the Note tool, and Send hands it to a Claude Code session listening on the board.

- The agent answers in the note's thread through `notes reply` and closes it with `notes done`
- Paste or drop a PNG, JPEG, GIF, or WebP image into a note or a reply, and the agent gets its path to open
- The notes stay in each page's `notes.json`, and their images in its `.notes/` folder

## Signing and starting a session

A note is signed with the name you set from the avatar menu, and with git's `user.name` until you set one. The name is saved for every board on this machine in `$XDG_CONFIG_HOME/frameboard/config.json`, else `~/.config/frameboard/config.json`.

- With nobody listening, Send can start a session through a command you export before `serve`, such as `FRAMEBOARD_DISPATCH='claude --bg "$FRAMEBOARD_NOTE"'`, which gets the note in its environment
- The command runs in the folder `serve` started in, and `claude --bg` starts only once Claude Code trusts that folder
