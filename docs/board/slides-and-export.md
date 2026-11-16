---
title: Slides and export
description: Slide transitions and steps, motion, PNG and filmstrip export, and opening a project on a phone
---

# Slides and export

The Slides and Export tabs, and the Motion section a moving frame adds.

## Slides

- The inspector's Slides tab sets the page's transition drawn between slides while presenting, with a direction for Slide and Push and a duration, and a frame's This slide row sets its own
- Both lists show a transition the project added under `assets/transitions/` after the built-in ones, by its file's name
- An element's Slides tab sets the step it appears on with an effect and a start, so the arrows reveal a slide's steps in order before moving on, and the bar shows a dot per step, or the count past six

## Export

- The inspector's Export tab saves one selected frame as a PNG at 1x, 2x, or 3x, in light, dark, or both, where Copy as PNG puts it on the clipboard at 2x in the theme on screen
- Its Name field starts as the frame's name and takes any name you type, and each file is listed under the button, as `hero.light@2x.png`
- With one element selected the same section exports that element alone on a transparent background, named `<frame>-<element>` until you type over it
- The Export tab's Filmstrip puts up to 12 moments of a moving frame in one row at Export's scale and theme, offering only counts that fit, named like `hero.filmstrip-5.light@2x.png`

## Motion and phone

- A selected frame that animates gets a Motion section, whose track holds it at any moment and whose play runs it on to its end, in your tab alone. A Held chip on its label resumes it.
- Open on a phone, at the foot of the Export tab, shows a code a phone on the same Wi-Fi scans to open the frame's project, read only, until the card closes
