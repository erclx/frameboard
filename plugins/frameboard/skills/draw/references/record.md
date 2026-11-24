---
title: Record
description: When a project keeps its accepted frames in a tracked folder, how references sync fills that folder and what it removes
---

# Record

Read this when a project keeps accepted frames in a folder its repository tracks, or the developer asks for a design record. Take the flags and refusals from the `references sync` entry of `frameboard docs --json`, since they describe the installed version.

## Sync the folder

`frameboard references sync <folder>` writes each mapped frame as its HTML, a PNG per theme, and the assets it loads. The folder's own `frames.json` names those frames under one `frames` object, whose keys are references and whose values are `<project>/<page>/<frame>` refs.

1. Create `frames.json` when the folder has none, and otherwise read it. Add each frame the developer accepted and no other, since a sync refuses a missing or empty map.
   - Write each key as a lowercase kebab-case `<group>/<name>` or `<group>/<section>/<name>`, with no extension, such as `app/home`
2. Look at what the folder holds before the first sync, since the run removes every file it did not write below the folder's first level.
3. Run the sync, then look at the images it wrote.

Render every PNG again after a token sheet or a kit changes, through the flag `docs` names, since a plain sync keeps the PNG of a frame that held still.

## Reach for capture instead

Use `capture --all-pages` when the developer wants images of a whole project and nothing to keep in step, since it writes images alone.
