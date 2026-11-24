---
title: Record
description: When a project keeps its accepted frames in a tracked folder, how references sync fills that folder and what it removes
---

# Record

Read this when a project keeps accepted frames in a folder its repository tracks, or the developer asks for a design record. Take the flags and refusals from the `references sync` entry of `frameboard docs --json`, since they describe the installed version.

## Sync the folder

`frameboard references sync <folder>` writes each mapped frame as its HTML, a PNG per theme, and the assets it loads. The folder's own `frames.json` names those frames, under `frames`, as a path in the folder to a `<project>/<page>/<frame>` ref.

1. Read the folder's `frames.json` and add the frame the developer accepted. Never add one they have not accepted.
2. Look at what the folder holds before the first sync, since the run removes every file it did not write below the folder's first level.
3. Run the sync, then look at the images it wrote.

Render every PNG again after a token sheet or a kit changes, through the flag `docs` names, since a plain sync keeps the PNG of a frame that held still.

## Reach for capture instead

Use `capture --all-pages` when the developer wants images of a whole project and nothing to keep in step, since it writes images alone.
