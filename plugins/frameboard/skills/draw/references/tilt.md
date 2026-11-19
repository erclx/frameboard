---
title: Tilt
description: How to tilt an element in 3D with perspective inside its own transform, in the order the inspector reads back
---

# Tilt

Read this when the task turns a flat element in 3D, such as a card leaning toward the viewer or a screenshot laid at an angle. A model is for an object that must turn from every side, which is `models.md`. Take every other rule from `frameboard docs --json`.

## Put the turn on the element

Write `perspective()` as the first function of the tilted element's own `transform`, never `perspective` on its parent.

- A parent's perspective makes every child share one vanishing point, so two tilted cards disagree and the inspector cannot read either one back
- The inspector's 3D section reads one element's own `transform`, so a tilt written anywhere else shows as no tilt there

## Write it in the order the section reads

The section writes `perspective()`, `translateZ()`, `rotateX()`, `rotateY()`, then `rotateZ()`, with perspective and depth in px and each turn in deg.

- Write them in that order and leave a zero out, since a transform in another order or unit, or holding a `matrix()` or `translate()`, reads as one the section did not write
- State a turn with the perspective, since a perspective alone does nothing
- Take 800px when unsure, since that is the value the section writes on a first tilt

## Size before tilting

A tilted element takes no corner resize and draws no selection marks, so size and place it first.

## Check it

Capture the frame in both themes and look at the edges, since a strong perspective throws a corner far from the box and can clip.
