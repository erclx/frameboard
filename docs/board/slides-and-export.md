---
title: Slides and export
description: Slide transitions and steps, speaker notes, motion, PNG and filmstrip export, and opening a project on a phone
---

# Slides and export

The Slides and Export tabs, and the Motion section a moving frame adds.

## Slides

- The inspector's Slides tab picks the page's transition from a grid of tiles, with a direction for Slide and Push and a duration under it, and a frame's This slide grid sets its own
- Hovering a tile plays it on the selected slides, and a click saves it. Transitions under `assets/transitions/` follow the built-ins, by file name.
- An element's Slides tab sets the step it appears on, its effect from the same tiles, and its start as On press, With last, or After last
- While presenting, the arrows reveal a slide's steps in order before moving on, and the bar shows a dot per step, or the count past six
- G while presenting, or the bar's grid button, shows every slide, the one on stage badged Now and the arrows' place ringed. Enter, a click, or a typed number and Enter jumps to that slide's first step.
- Alt+Shift+P or the bar's Presenter view button opens a second window with the slide now, the next one, the note, a timer, and the clock, and F then takes the audience full screen
- The bar's Rotate turns a phone or tablet slide landscape and back, and the presenter view follows it

## Speaker notes

- The Notes button in the Slides tab's Page section shows a Speaker notes strip under every slide of the page, where you write what you mean to say over each one, and pressing it again hides them all
- Notes start hidden, the choice is kept in this browser, and while they are hidden a slide holding a note carries a small note mark on its label
- The note saves when you click away or press Ctrl+Enter, and Esc puts back what was there before you started typing
- A note never enters the frame's file, so an agent rewriting the slide keeps it
- The audience's window shows no note, and the presenter view shows it under the next slide, scrolling a long one

## Export

- The inspector's Export tab saves one selected frame as a PNG at 1x, 2x, or 3x, in light, dark, or both, where Copy as PNG puts it on the clipboard at 2x in the theme on screen
- Its Name field starts as the frame's name and takes any name you type, and each file is listed under the button, as `hero.light@2x.png`
- With one element selected the same section exports that element alone on a transparent background, named `<frame>-<element>` until you type over it
- An export, a presented slide, and the phone link leave out every drawn control, so the design ships without its sliders
- The Export tab's Filmstrip puts up to 12 moments of a moving frame in one row at Export's scale and theme, offering only counts that fit, named like `hero.filmstrip-5.light@2x.png`

## Motion and phone

- A selected frame that animates gets a Motion section, whose track holds it at any moment and whose play runs it on to its end, in your tab alone. A Held chip on its label resumes it.
- Open on a phone, at the foot of the Export tab, shows a code a phone on the same Wi-Fi scans to open the frame's project, read only, until the card closes
