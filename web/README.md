# Frameboard landing page

The public page for Frameboard, a static Astro site built against `canon/design/landing/` at the repository root.

- `bun run dev`: serve the page on port 4321 plus the worktree offset
- `bun run check`: the gate, being typecheck, lint, unit tests, and the build
- `bun run card:dev`: serve the social card route on port 4421 plus the worktree offset, kept out of the published build by `bun run card:check`

## Social card

The card at `card-src/pages/og-card.astro` reads the page's tokens from `src/styles/global.css`, so a token change reaches the two cards in `public/` only when someone captures them again. With `bun run card:dev` running, capture both from the repository root:

```bash
canon capture http://localhost:<port>/og-card --selector .card --out web/public/og-image.png
canon capture "http://localhost:<port>/og-card?theme=dark" --selector .card --out web/public/og-image-dark.png
```

Each capture prints 1200x630. Delete the `.stamp` files they write beside the images, since their source lines name a local port.

A link preview shows one image whatever the reader's theme, so the site publishes one card. `socialCard` in `src/pages/index.astro` names it, and pointing it at `/og-image-dark.png` switches the site to the dark card.
