---
title: Board
subtitle: The browser app, split into the shell, commands, agent work, the inspector, the hand actions, and the server
---

# Board

The browser app, split into the shell, commands, agent work, the inspector, the hand actions, and the server

- [Agent work on the board](agent-work.md): Notes, claimed frames, agent change marks, and the live store that carries them to the board
- [Commands](commands.md): The action registry, the command palette and shortcuts sheet, and undo and redo with the server history they read
- [Frame bridge](frame-bridge.md): The script inside each frame that answers the board over postMessage, and the board's end of that channel
- [Frame port](frame-origin.md): The second loopback listener that serves frames, their assets, and the look apart from the board's own origin
- [Hand actions](hand-actions.md): Selection, hide and lock, arranging and snapping, copying a frame as an image, right-click menus, and the keys behind each
- [Home view](home.md): The home view's project cards and rows, and the project actions it shares with the board
- [Inspector](inspector/index.md): The right panel, its element sections, and the color picker
- [Left panel](left-panel.md): The left panel's header, its Design, Theme, and Assets tabs, the page and layers lists, and the first-run guide
- [Placing elements](placing.md): The Text, Shape, and Image tools, where a new element lands in a frame, and the drop of an asset tile
- [Playback](playback.md): A frame's motion held in the board, Play mode, and presenting a page as slides
- [Board server](server.md): Folder watcher, socket hub, claims record, write access, and the HTTP routes behind the board
- [Board shell](shell.md): The board screen and canvas, Edit and Play, the panels, find, and the toolbar
