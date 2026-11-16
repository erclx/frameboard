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
- No `filter` or `background` of your own on a kit box, since its outline and fill sit on its `::before` layer
- Short labels, since Caveat reads slower than a text face
- The `kit` page shows every part drawn in this look
