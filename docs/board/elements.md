---
title: Elements
description: Placing text, shapes, images, video, audio, and 3D models in a frame, moving and resizing them, and media controls
---

# Elements

How you add an element to a frame and change its size and place.

## Text and shapes

The Text and Shape tools drop a paragraph, rectangle, ellipse, or divider into a frame where you click, sizing a rectangle or ellipse to a drag that previews the shape. Drag an element to move it, press Delete to take it out, or double-click text to retype it, Enter adding a line. Alt+Shift+ArrowUp and ArrowDown step it among its siblings.

- Text beside another element, such as words around a `code`, retypes only the run you double-clicked, and Enter adds a line there only where the element already keeps its breaks

Drag a corner of selected upright text, a shape, an image, a video, a model, or a container to resize it. Text wraps to the new width with its height following, a container sets each side you drag to Fixed, and Shift keeps a shape's or media's ratio. Inline text and a divider draw no corner marks.

## Where a new element lands

Past a frame's edge, an Absolute element shows as a dashed ghost a press drags back, unless the frame scrolls.

- A new element lands where you drew it unless its parent lays out as flex or grid, where it joins the flow, and a divider always joins the flow
- Position's In flow and Absolute move it either way afterward

## Images, video, and audio

Images, videos, audio, and 3D models come from the project's `assets/` folder and land the same way. A model is a `.glb` or `.gltf` file, and the Assets tab refuses any other model file with the way to export one from Blender.

- Image, video, audio, or model in the Shape menu, or Cmd+Shift+K, picks a file and places it where you click, at its own size capped at the column's width, and audio lands as a player 300px wide
- Dragging a tile from the Assets tab onto a frame places it where you let go. A video tile shows its first frame and length, plays muted on hover, and says when its codec cannot play.
  - A tile let go over empty canvas makes a frame the file's size, outlined while you drag, and one undo takes the frame and its media back
  - Find, beside Files in the Assets tab, searches Openverse for public domain photos. Save brings one into `assets/` with its license file, and a result dragged onto a frame saves, then lands.
  - Generate shows the provider and its price, and stays off in this release, so `frameboard image generate` makes an image instead
- A model lands 240 by 135 as a `<model-viewer>`, and the first one placed copies the viewer's script into `assets/` and links it in the frame's head
- A dropped video is written with `controls`, so Play shows the browser's own strip to pause it and turn on its sound
- A selected video in Edit draws a bar inside its bottom edge, and an audio's bar sits under it
  - The inspector's Video section carries the same play, scrub, and sound controls, which change nothing in the file
- Controls, Autoplay, Loop, and Muted under In the file are the switches that write, each setting or dropping one attribute while the clip keeps playing, and audio has no Controls switch

A right-click on an Assets tile, or its ⋯, places the file, lists the frames using it, or renames, replaces, or deletes it, each as one undo step. A rename points every frame linking the file at its new name, and Delete asks first when a frame uses it.

## Drawn controls

A slider an agent draws beside an element can tune it, keeping the frame plain HTML and CSS.

- A range or number input carrying `data-binds="#photo --brightness"` and `data-unit="%"` sets that custom property on its target, which the target's own CSS reads through `var()`
- In Edit, a selected frame tags each control with what it binds and draws a dashed line to its target, and a red tag marks one that matches nothing
- In Play, moving a control changes its target live, and a bar in the frame's corner offers Keep values, which writes every moved value as one undo step, or Reset
- Leaving the frame or Play without keeping puts the file's values back, and a view-only tab tunes without Keep values
