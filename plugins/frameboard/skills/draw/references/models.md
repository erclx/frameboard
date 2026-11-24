---
title: Models
description: When a frame shows a 3D model, finding one on Poly Haven or generating one from a picture, the viewer script its head loads, the attributes that stage it, and how to build a simple model with a kept script
---

# Models

Read this when a frame shows a 3D object the developer turns, such as a product on a landing page. Take the element, its script, its attributes, and the capture record from the `models` block of `frameboard docs --json`, since they describe the installed version.

## Reach for a model only when it turns

A model costs a script of about 1 MB in the project and a wait on every capture, so draw anything flat in HTML and CSS.

- Place a model when the developer names a 3D object, or asks for one they can turn or that plays a clip
- Tilt a flat card with a CSS `transform` instead, since a tilt needs no model and no script
- Use a `.glb` the project's `assets/` already holds, then a found one, then a generated one, before building one

## Find a model before building one

`frameboard model find <query>` searches Poly Haven's 522 public domain models and saves one into the project's `assets/` as a single `.glb` with its license file. Take the ranking and the flags from the `models` block of `frameboard docs --json`.

- Search for an everyday object, since the library is mostly props, furniture, plants, rocks, and industrial parts, with almost no named product such as a phone, a laptop, or a shoe
- Answer a product search that comes back empty by building the shape from boxes, below, rather than searching again with other words
- Save at the default `1k` unless the developer asks for detail, and say what a larger `--size` weighs before taking it, since a stool is about 1 MB at `1k` and 40 MB at `8k`
- Name Poly Haven to the developer when showing results, which its terms ask of anything listing its models

## Generate a model from a picture

`frameboard model generate <picture>` turns one picture into a textured `.glb` on the developer's own ComfyUI server, saved into the project's `assets/` with a license naming the picture. Read `${CLAUDE_SKILL_DIR}/references/generate.md` before a run, since it covers the dry run, the wait, and freeing the GPU.

- Reach for it when Poly Haven has nothing close and the developer wants a real object rather than boxes
- Give it a clean picture of one object on a plain ground, such as one `image generate` made first, since a busy photo comes out worse

## Write the element and its script

A frame shows a model through one `<model-viewer>` element, which draws only where the frame's head loads the viewer script from the project's `assets/`.

1. Check that the project's `assets/` holds the viewer file the `models` block names. Copy it from the path that block gives when it does not.
2. Add the script tag from that block to the frame's `head`, once, however many models the frame shows.
3. Write the element with its `src` as `../assets/<file>.glb`, an `alt` saying what the model is, and a width and height in its `style`.

Never link the viewer or a model by a web address, since a frame loads nothing over the network.

## Stage it with attributes

Every staging choice is an attribute on the element, so set one with `frameboard edit --attr` on a placed frame rather than rewriting the file.

- Set `camera-orbit` for the angle, and `max-camera-orbit` beside it once the distance passes the model's own framing, since the viewer ignores the distance otherwise. The inspector shows the angle under Camera.
- Set `orientation` to turn the model itself and `scale` to size it. The inspector shows `orientation` under Model.
- Turn a model with `orientation` rather than a CSS `transform`, since the inspector hides its box rotation for a model whose `style` sets no `transform` and no `rotate`
- Set `animation-name` and `autoplay` only for a model that carries a clip
- Read the element again before staging it, since the developer may have turned it by hand on the board

## Build a simple model with a kept script

A shape made of boxes, such as a phone, a card stack, or a laptop, takes a short script that writes the `.glb` itself, with no modeling tool.

- Write the script in standard-library Python, and keep it beside the model in the project's `assets/`, so a later change edits the script and runs it again
- Give each part its own box, base color, metalness, and roughness, with four vertices per face so each face keeps a flat normal
- Name a clip in the file for a model that moves, and keep it to a few seconds
- Tell the developer the shape reads as blocks, and ask for a `.glb` exported from Blender when it needs curves

## Check and capture it

A model that cannot load is a finding, and a capture waits for each model before the shot.

- Fix a `missing-file` finding on the element or the script tag before anything else, since the frame draws an empty box until both load
- Look at each captured image, and read its `models` list, which names a model that failed or was still loading when the wait ran out
- Capture a model that plays a clip with `--at` at a few moments, since a plain capture holds it at the start
