---
title: Images
description: How a session finds or generates a photo or picture a frame shows, saving it into the project's assets with its license rather than fetching one its own way
---

# Images

Read this when a frame needs a photo, an illustration, or any picture you did not draw in HTML and CSS. Take every flag, record, and refusal from the `image` verbs and the `images` block of `frameboard docs --json`, since they describe the installed version.

## Find before you generate

A found photo costs nothing and carries a license anyone can check, so search first.

1. Run `frameboard image find "<what it shows>" --json`. It searches Openverse for public domain images and writes nothing.
2. Look at the results' `title` and `thumbnail`, and pick the one that fits the screen.
3. Save it with `frameboard image find "<same query>" --save <id> --json`, passing the result's `id` rather than its `number`, since a second search can rank differently and Openverse allows an address 200 anonymous requests a day.
4. Pass `--name <stem>` for a file name that says what the image is for, such as `hero`.

Add `--credited` only when no public domain image fits, since a CC BY image owes its creator a visible credit. Put its `attribution` line in the frame when you use one.

## Generate only when nothing fits

`frameboard image generate` spends on the developer's own key the moment it runs, and it never asks first. When `FRAMEBOARD_COMFYUI_URL` is set, it runs on the developer's own ComfyUI server first, at no charge.

- Run `frameboard image doctor --json` to see which keys are set before offering to generate
- Run `frameboard image generate "<prompt>" --dry-run --json` first and tell the developer the provider and `priceUsd` it answers
- Run it without `--dry-run` only once the developer agrees to that spend, or asked for a generated image in so many words. A `comfyui` answer at `priceUsd` 0 spends nothing, so generate at once.
- Run `frameboard image free --json` once a batch of local generations ends, since the server holds the model in GPU memory until then
- Pass `--workflow <file>` only for a ComfyUI workflow the developer names, never one you wrote
- On `no-provider`, tell the developer which key to set and use a found image meanwhile
- Never print, log, or write a key, even when a refusal names one as unset

## Link the saved file

A saved image's `path` sits relative to the project's `assets/`, at `data.path` from `image find --save` and at `data.saved.path` from `image generate`. Its license file lands beside it as `<path>.license.json`.

- Link the image from a frame as `../assets/<path>`, since a frame sits one folder below the project
- Leave the license file where it lands, since it is the one record of where the image came from
- Never link an image by its web address, since a frame loads nothing over the network
