---
description: Keep a local preview running so a UI pull request's evidence comment carries its link
paths:
  - 'src/client/**'
---

# Local preview standards

## Running the preview

- Before shipping a change to a rendered surface, run `bun run build` then `bun run preview` in this worktree, so the evidence comment carries the local preview link.
- Keep the server running through review, restart it on each new head, and stop it when the pull request closes.

## Lifetime

- Remove this rule once erclx/canon#2403 ships.
