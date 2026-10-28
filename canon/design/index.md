---
title: Design references
subtitle: The accepted look of every board surface, as light and dark captures beside their frame HTML
auto: false
---

# Design references

Each group holds accepted frames a build matches, light and dark.

## Board

The board's frame and the inputs every part draws on read first.

| Group         | What the user sees                                    | Code                                                   | States                                                                                                                                                                                                                          |
| ------------- | ----------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `foundations` | Chrome tokens and parts, the colors, the logo         | `src/client/styles.css`, `src/client/public/icon.svg`  | Both themes, and the Frameboard kit sheets                                                                                                                                                                                      |
| `toolbar`     | The floating toolbar under the canvas                 | `src/client/board/chrome/`                             | The pill over the canvas, Frame's caret open on Section                                                                                                                                                                         |
| `shell`       | The board frame around the canvas and its side panels | `src/client/board/screen.tsx`, `chrome/`               | UI hidden, panels at a fixed width                                                                                                                                                                                              |
| `canvas`      | Frames on the canvas, their labels, and selection     | `src/client/board/canvas.tsx`, `geometry/`, `guide/`   | Empty page, play mode, marquee, snapping, findings, labels at low zoom, every frame hidden, a frame previewed at phone width, a new board's guide at each step and a refused name, a section around two frames nested in Layers |
| `layers`      | The left panel's pages, layers, and find              | `src/client/board/left-panel/`, `find/`                | Editing a layer, many pages, a search, find results                                                                                                                                                                             |
| `tabs`        | The left panel's Theme and Assets tabs                | `left-panel/theme-tab.tsx`, `src/client/board/assets/` | Tokens shown, no tokens, assets                                                                                                                                                                                                 |
| `inspector`   | The right panel for a frame or an element             | `src/client/board/inspector/`                          | Text element, one frame, several frames, the Preview row idle and active                                                                                                                                                        |

## Home, overlays, and agents

The home view, the overlays, and the agent's marks follow.

| Group     | What the user sees                                                                               | Code                                                | States                                                                                   |
| --------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `home`    | The project list a board opens on                                                                | `src/client/home/`                                  | Grid, list, no projects, the sort control and a pinned favorite in grid and list         |
| `palette` | The command palette and the shortcuts sheet                                                      | `src/client/palette/`                               | Commands listed, shortcuts open, the shortcuts sheet on home                             |
| `menus`   | Right-click and avatar menus, and the copy toast                                                 | `src/client/board/menus/`, `chrome/avatar-menu.tsx` | Home card, home card pin, home sort menu, canvas, avatar, a toast shown                  |
| `agents`  | An agent's claim on a frame, its unseen changes, compare, and the offer to jump to a shown frame | `src/client/board/claims/`, `changes/`              | Claim held, claim pulsing, one or many unseen, compare flipped and split, a show offered |
| `notes`   | Notes pinned on frames and their threads                                                         | `src/client/board/notes/`                           | Placing a note, a thread open                                                            |

## Landing

The public page in `web/` follows, a separate project from the board.

| Group     | What the user sees                                                     | Code               | States                 |
| --------- | ---------------------------------------------------------------------- | ------------------ | ---------------------- |
| `landing` | The landing page, from the hero through the walkthrough to the install | `web/src/landing/` | The whole page at once |

## Writing the folder

A frame is drawn on the design board at `.canon/board` in the main worktree. Only `bun run design:sync` writes it here, capturing each frame `frames.json` maps.

`bun run design:sync --check` fails on a changed frame or kit file and on a missing or stray file. It only warns on a PNG whose bytes differ, since the HTML is the source and a PNG varies with the browser build.
