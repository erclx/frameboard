#!/usr/bin/env bash
set -e
set -o pipefail

# Fails a build that carries the social card route, since a widened srcDir would
# publish a scaffolding page with every other check green, and exclusion is the
# one of its three consumers a check can enforce.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="${PROJECT_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"

DIST="$PROJECT_ROOT/dist"
CARD_CONFIG="$PROJECT_ROOT/card.config.mjs"
MARKER='name="og-card-marker"'

# No card route installed, so there is nothing to exclude. Reported rather than
# passed silently, since a check that says nothing is indistinguishable from one
# that looked and found nothing.
if [ ! -f "$CARD_CONFIG" ]; then
  echo "check-card-exclusion: no card.config.mjs, so no card route to exclude"
  exit 0
fi

# Nothing to grep without a build. Callers run this after `bun run build`, so an
# absent dist here means the build itself failed rather than something this
# check can verify.
if [ ! -d "$DIST" ]; then
  echo "No $DIST. Run bun run build first." >&2
  exit 1
fi

# Asserts the route still carries its marker, so a dropped one fails loudly
# rather than blinding the leak test below.
if ! grep -rl "$MARKER" "$PROJECT_ROOT/card-src" >/dev/null 2>&1; then
  echo "No $MARKER under $PROJECT_ROOT/card-src. The card route dropped its own marker, which is what the leak test below reads for." >&2
  exit 1
fi

if grep -rl "$MARKER" "$DIST" >/dev/null 2>&1; then
  echo "The card route's marker ($MARKER) reached $DIST. See card.config.mjs's srcDir." >&2
  exit 1
fi

# Built pages in either Astro format, searched from inside dist so a checkout
# path such as blog-card-site cannot match on its own prefix.
if (cd "$DIST" && find . -ipath '*og-card*' -name '*.html' | grep -q .); then
  echo "A page named for the card route reached $DIST. See card.config.mjs's srcDir." >&2
  exit 1
fi

echo "check-card-exclusion: card marker present in card-src, absent from $DIST"
