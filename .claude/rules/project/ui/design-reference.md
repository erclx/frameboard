---
description: Build board surfaces against the tracked design references, and land a canvas design in them through the sync before building on it
paths:
  - 'src/client/**'
  - 'canon/design/**'
---

# Design reference standards

## Where the design lives

- Build UI against `canon/design/`, never against the canvas directly.
- Land a picked or changed canvas design in `canon/design/` with `bun run design:sync`, as its own pull request, before any feature builds against it.
- Never copy, edit, or delete a reference file under `canon/design/` by hand.
- Add a new surface's row to `canon/design/index.md`, naming its picked frames alone, before running the sync.
- Remove a surface's row from `canon/design/index.md` only in the change that removes the surface from the app.

## Building against a reference

- Open each reference PNG and its frame HTML, light and dark, before changing the surface they show.
- Match the reference closely or identically, taking sizes, spacing, and colors from the frame HTML.

## Showing the comparison

- Put each changed surface's reference PNG beside its built capture, light and dark, in the pull request description.
- Name each place the build departs from its reference, with its reason, in the pull request description.
- Report an unexplained departure from a reference as a review finding.
