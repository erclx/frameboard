---
title: Generate
description: How a session gets images and 3D models running on the developer's own ComfyUI server, from image doctor's setup steps to freeing the GPU
---

# Generate

Read this when the developer asks to set up local generation, or a picture or a model should be made on their own ComfyUI server. Take every flag, record, and refusal from the `image` and `model` verbs and the `images` and `models` blocks of `frameboard docs --json`, since they describe the installed version.

## Set the server up

`FRAMEBOARD_COMFYUI_URL` names the server, and a run on it charges nothing.

1. Run `frameboard image doctor --json`. It reports the GPU, whether a server answers, the model files each verb still lacks, and the steps that would finish the setup.
2. Hand those `setup` steps to the developer, who runs each one, since the verb installs nothing.
3. Run it again once they are done. An empty `setup` means images and models both run locally.

A missing model file blocks only the verb it is tagged for, so a machine that cannot make models may still make images.

## Run on it

- Run either generate verb with `--dry-run --json` first when unsure the server is set. The image one answers the provider it would use, and the model one refuses `no-provider` while the address is unset.
- Generate at once when an image dry run answers `comfyui`, since it spends nothing, and read `${CLAUDE_SKILL_DIR}/references/images.md` when it answers a paid provider
- Expect about a minute per model, with nothing printed until it returns
- Pass `--workflow <file>` only for a ComfyUI workflow the developer names, never one you wrote

## Free the GPU

Run `frameboard image free --json` once a batch of images or models ends, since the server holds its models in GPU memory between calls.
