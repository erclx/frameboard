---
title: Drive basics
description: The everyday hand edits every app drive runs first, the same way each time, with what to check after each step
---

# Drive basics

Every app drive runs these scenarios before its goal pass, on a project made for the drive, with a real pointer and real keys. Each step passes when the frame file reads as its check says. A step that does not becomes a finding with a screenshot, numbered in the drive log like any other.

## 1. Frame

1. Pick the frame tool, choose Phone, and click bare canvas.
2. Press F2 and rename the frame `signup`.

Check that `signup.html` exists and the old name's file is gone.

## 2. Text

1. Pick Text and click inside the frame, then type `Create account`.
2. Double-click the text, add ` today` at its end, and press Escape.
3. Set Font size to 28 in the inspector.

Check that the text reads `Create account today` and carries `font-size: 28px`.

## 3. Shape

1. Pick the rectangle tool and drag a box inside the frame.
2. Set Corner radius to 12, then pick `primary` from Fill token.

Check that the box carries `border-radius: 12px` and `background: var(--primary)`.

## 4. Auto layout

1. Select the text and the box together, then press Shift+A.
2. Set Gap to 16, both paddings to 24, and Align center center.

Check that one container holds both, with `display: flex`, `gap: 16px`, and both centering keys.

## 5. Child sizing and free placement

1. Set the box's width to Fill.
2. Switch the text to Absolute from Position, then back to In flow.

Check that the box carries `align-self: stretch`, and that the text ends back in the flow.

## 6. History

1. Select the frame and press Ctrl+D.
2. Press Ctrl+Z twice, then Ctrl+Shift+Z once.

Check that the duplicate is gone and the box's Fill came back.

## 7. Theme

1. Switch the board to dark.
2. Flip the `signup` frame back to light from its label.

Check that every other frame's page went dark within a second and `signup` stayed light.

## 8. Media

1. Drag an image tile from Assets into the frame.
2. Drag a model tile and an audio tile in after it.

Check that each lands inside the frame's edges, as `img`, `model-viewer`, and `audio`.

## 9. Out of the board

1. Export the frame as a PNG from the Export tab.
2. Present the page, step once, and press Escape.

Check that one PNG downloads and the presentation opens on the frame.

## Recording a run

The drive log takes one `pass` entry naming the steps that passed, and one finding per step that failed.

- Screenshots go under the drive's `evidence/basics/`, never into the repository
- A step the build cannot reach is logged as not driven, with the reason
