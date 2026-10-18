---
description: Build board surfaces against the tracked design references, and land a canvas design in them through the sync before building on it
paths:
  - 'src/client/**'
  - 'canon/design/**'
---

# Design reference standards

## Where the design lives

- Land a picked or changed canvas design in `canon/design/` with `bun run design:sync`, as its own pull request, before any feature builds against it.
- Add a new surface's row to `canon/design/index.md`, naming its picked frames alone, before running the sync.
- Remove a surface's row from `canon/design/index.md` only in the change that removes the surface from the app.

## Naming

- Name each file with no canvas page number and no `picked-` prefix.
- Give a new design a row in `canon/design/index.md` whose Folder column names its folder, and let the sync name its files from it.
