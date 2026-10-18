---
description: House style for frames on the canvas, covering type, the shared kit, fit, theme, and page order
paths:
  - '.canon/canvas/**'
---

# Canvas standards

## Style

- Give an app mockup the app's real sizes and viewport width.
- Set the font family to `"Geist Variable"` alone, since a machine family such as `DejaVu Sans` renders at another height and `canon canvas fit` reports it as `font`.

## Fit

- Leave no clipped line in a frame's box.
- Capture the whole page with `--composite` after a frame's size or position changes.

## Kit

- Build every new or redrawn explanation frame on the kit, linking `../01-kit/kit.css`, plus `../01-kit/vendor/rough.js` and `../01-kit/kit.js` for a diagram or chart.
- Draw a mockup of Frameboard's own chrome off the kit, in the look `canon/DESIGN.md` settles, taking its tokens and parts from the `design-system` page.
- Keep the `kit` page for the explanation kit and the `design-system` page for Frameboard's own tokens and parts, and never mix the two.
- Give the frame's `html` the class `kit`, and `kit hand` only for rough thinking, never for a chart.
- Draw diagrams and charts with the `KIT` functions, never hand-placed boxes.
- Let color name a kind, being tool, data, outside, warn, or risk, with the signal color on one thing per frame.
- Separate with rules and space, and box only a diagram node.
- Add a part to the kit before a second page needs it.
- Leave a pre-kit page on its own `style.css` until it is redrawn.

## Theme

- Take every color from the kit's custom properties, with the light set under `[data-theme="light"]`, and write no literal color.
- Say the light theme was not looked at when a frame was checked by capture alone.

## Order

- Prefix each page name with two digits in reading order, renumbering with `canon canvas page rename`.
- Cite a canvas page in prose, such as a skill, a rule, or a plan, by its name without the number, such as the `kit` page. A frame's relative link to the kit keeps its numbered path.
- Lay the candidates for one decision side by side, the dark ones in one row and the light ones in the row under it.
- Lay a single surface as one row, dark then light.
- Add each later round of one decision as new rows on that decision's page, never as a new page.
- Retire a page by moving it to `.canon/tmp/retired-canvas/`, never by deleting it.

## Asking the operator

- Name the page and the frame, and its row and side, whenever a question or a request to look points at the canvas.
- Highlight a picked frame with a yellow border and a picked badge, and lead its name with `picked-`.
