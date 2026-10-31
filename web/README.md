# Frameboard landing page

The public page for Frameboard, a static Astro site built against `canon/design/landing/` at the repository root.

- `bun run dev`: serve the page on port 4321 plus the worktree offset
- `bun run check`: the gate, being typecheck, lint, unit tests, and the build
- `bun run card:dev`: serve the social card route on port 4421 plus the worktree offset, kept out of the published build by `bun run card:check`

## Social card

The card at `card-src/pages/og-card.astro` reads the page's tokens from `src/styles/global.css`, so a token change reaches `public/og-image.png` only when someone captures it again. With `bun run card:dev` running, capture from the repository root:

```bash
canon capture http://localhost:<port>/og-card --selector .card --out web/public/og-image.png
```

The capture prints 1200x630. Delete the `.stamp` file it writes beside the image, since its source line names a local port.
