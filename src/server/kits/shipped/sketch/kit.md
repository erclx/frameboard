# Sketch

Hand drawn boxes, tilted notes, and Caveat, for a brainstorm that should read as unfinished.

## Reach for

- `.kit-card` for a box holding one idea or one control group
- `.kit-note` for a sticky note, which tilts on its own and alternates its tilt with the next note
- `.kit-button`, plus `.kit-primary` on the one action that matters
- `.kit-line` on an SVG `path` for an arrow or a connector, which roughens with the boxes
- `.kit-muted` for secondary text

## Keep to

- Color through `--accent`, `--surface`, `--text`, `--muted`, `--line`, and `--note` alone, so dark mode follows
- Set a box's fill through `--fill`, as in `style="--fill: var(--accent)"`, never `background`, since the outline and fill sit on its `::before` layer above the box's own background
- No `filter` of your own on a kit box, which would roughen its text too
- A fill set by hand in the inspector writes `background`, so it stays hidden under a Sketch box's fill
- Short labels, since Caveat reads slower than a text face
- The `kit` page shows every part drawn in this look
