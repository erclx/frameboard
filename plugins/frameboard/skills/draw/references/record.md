---
title: Record
description: Keeping the board's accepted frames in a tracked folder as HTML, a PNG per theme, and the assets they load, through references sync
---

# Record

Read this when the project keeps its accepted designs in a folder the repository tracks, or the developer asks for a design record. Take the flags, the `frames.json` shape, and every refusal from the `references sync` entry of `frameboard docs --json`, since they describe the installed version.

## Sync an accepted frame

- Run `frameboard references sync <folder>` after the developer accepts a frame, so the folder holds its HTML, a PNG per theme, and the assets it loads
- Name the frames to keep in the folder's `frames.json`, and read the `docs` entry for its shape rather than guessing it
- Expect the run to remove every other file below the folder's first level, so never point it at a folder holding anything else
- Tell the developer which frames it wrote, since the folder is theirs to commit

## Keep it apart from capture

`capture --all-pages` writes images alone for judging or archiving. Reach for `references sync` only when the record needs the HTML and assets beside the images.
