---
title: Generate
description: Running images and 3D models on the developer's own ComfyUI server, from checking the setup to freeing the GPU, at no charge
---

# Generate

Read this when the developer asks to set up local generation, or `image generate` or `model generate` should run on their own ComfyUI server. Take every flag, record, and refusal from the `image` and `model` verbs of `frameboard docs --json`, since they describe the installed version.

## Check the setup first

- Run `frameboard image doctor --json` to see which keys and server files are set, and which a model workflow lacks
- Ask the developer to set `FRAMEBOARD_COMFYUI_URL` to their server's address when it is unset, and never set it for them
- Take an unset address refusing `no-provider` as the answer, and use a found image meanwhile

## Run on the server

- Run `frameboard image generate "<prompt>" --dry-run --json` or `frameboard model generate <picture> --dry-run --json` first, since the answer names the provider and its `priceUsd`
- Generate at once on a `comfyui` answer at `priceUsd` 0, since it spends nothing
- Expect about a minute per model with nothing printed until it returns
- Pass `--workflow <file>` only for a ComfyUI workflow the developer names, never one you wrote

## Free the GPU

Run `frameboard image free --json` once a batch of local generations ends, since the server holds the model in GPU memory until then.
