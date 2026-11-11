---
title: Lift an existing page
description: The five traps that make a frame copied from a live site look wrong, and what each check finding means on a lifted frame
---

# Lift an existing page

A lifted frame copies what the browser rendered, and five traps turn that copy into a frame that looks wrong.

- Snapshot the live DOM after the page's scripts ran, never the source markup, since scripts write state such as data attributes and transforms the markup never holds
- Copy the attributes on `<html>` along with the body, since a root attribute such as a script or theme flag decides what the page shows
- Bake each `<canvas>` to an image and pin animated text to its reduced-motion state before stripping scripts, since script-drawn content renders nothing once they are gone
- Cut fixed chrome on a long page into its own viewport-sized frame, since a translated page still reaches past the frame and `clipped` flags it
- Link the site's built CSS whole as one sheet rather than inlining the rules that match, since a serialized rule writes a `var()` shorthand out as empty longhands and the frame silently loses the value

## What a finding means

The rules a lift trips most read as below, and the last two rows cover a finding whose path names a linked sheet.

| Rule                  | In a lift it means                                                     | Do                                                                          |
| --------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `clipped`             | Page content or fixed chrome reaches past the frame's box              | Cut the chrome into a viewport-sized frame, or size the frame to the page   |
| `viewport`            | A section sizes itself off the viewport height                         | Keep it for a full-height screen, otherwise give the section its own height |
| `scrollbar`           | An element kept the site's scrolling container                         | Let the frame hold the content, or cut it into a frame of its own           |
| `dropped-declaration` | The parser drops a declaration, often a vendor hack in a built bundle  | Fix it when the path names the frame, and read the last two rows otherwise  |
| `unknown-token`       | A `var()` names a property declared in a sheet the frame does not link | Link the sheet that declares it                                             |
| `theme`               | The site sets literal colors with no other theme                       | Add the other theme beside them, as the skill's themes section says         |
| `network`             | The frame still loads a font, image, or script from the site           | Copy the file into the page folder or the project's `assets/` and link that |
| `missing-file`        | A lifted path points at a file nobody copied                           | Copy the file in, or drop the reference                                     |
| `outside-link`        | A root-absolute URL such as a bundle's `url(/static/...)`              | Copy the file into the page folder or `assets/` and make the URL relative   |
| Any warning           | The finding's path names a linked sheet rather than the frame          | Treat it as the site's own noise unless the frame renders wrong             |
| Any error             | The finding's path names a linked sheet rather than the frame          | Fix it in the copied sheet, since the frame is not clean until it passes    |
