---
title: Sourcing
description: The image verbs that find or generate a picture and the model verb that finds a public domain 3D model, saving each into a project's assets with a license file
---

# Sourcing

## Overview

Owns where a picture or a 3D model in a frame comes from, being the `image find`, `image generate`, `image doctor`, `image free`, and `model find` verbs and the code saving what they fetch into a project's `assets/`. Every saved file carries a `<file>.license.json` beside it, so a reader can tell where it came from.

## Layout

### `src/server/sourcing/`

Owns finding, generating, and saving, apart from `src/cli/` because the board's routes in `src/server/routes/sourcing.ts` call the same modules. Each module takes `fetch` as an argument rather than reaching for the global, so tests pass a fake and make no real call.

- `openverse.ts` searches with no key, under `cc0` and `pdm` alone unless `--credited` adds `by`, and refuses an id under a license the flags do not allow
- `polyhaven.ts` ranks Poly Haven's whole model list locally, having no search to call, and `pack-glb.ts` packs one size's glTF, read at `gltf['1k'].gltf`, into a GLB
- `save.ts` holds a download whole before any write, lands an image or a packed model through `addAssets`, and names the license file after it, taking the file back out when that write fails
- `generate.ts` picks the provider named, else the first in `PROVIDERS` whose key is set, in the order `comfyui`, `fal`, `google`, and prices it with no request, so `--dry-run` and a refusal spend nothing. It draws a seed per call, since ComfyUI answers a cached image for a prompt identical to the last.
- `doctor.ts` reads the GPU through `nvidia-smi`, probes ComfyUI's `/system_stats` for its version and `/models/<folder>` for the bundled workflow's files, and builds the setup steps it prints and never runs

### `src/server/sourcing/comfyui/`

Owns talking to a ComfyUI server the developer starts, apart from the providers because 3D generation reuses it.

- `client.ts` posts `/prompt`, polls `/history/<id>`, reads the first saved image from `/view`, and posts `/free`, resolving each route under any path the address carries. It waits up to `RUN_TIMEOUT_MS`, since a first call loads the model for 20 seconds or more.
- `workflow.ts` reads an API-format workflow and fills `{{prompt}}`, `{{width}}`, `{{height}}`, and `{{seed}}`, a number placeholder standing alone becoming a number, and refuses `usage` for a file with no `{{prompt}}`
- `flux2-klein.json` is the bundled FLUX.2 klein 4B workflow a run takes without `--workflow`

### `src/server/sourcing/providers/`

Owns one module per provider behind the `ImageProvider` interface in `provider.ts`, which keeps a provider from importing `generate.ts` back.

- `fal.ts` runs FLUX.1 schnell with `sync_mode`, so the image comes back inline
- `google.ts` runs `gemini-nano-banana-2.1` on the Interactions API at 1K, at the aspect ratio nearest the size asked
- `comfyui.ts` takes `FRAMEBOARD_COMFYUI_URL` as its key and prices every image at 0, running the bundled workflow or the developer's own

### `src/cli/commands/image.ts`

Owns the four `image` verbs. It resolves the project and the file stem before any request, so a refusal on either spends nothing, and it reads keys from the environment at call time and never stores one.

- `generate --workflow <file>` reads and checks the file ahead of the plan, so a dry run catches a bad one, and runs on `comfyui` alone, refusing `usage` beside another `--provider`
- A local run's license records the seed it drew and any workflow file, so one image can be made again
- `free` posts `/free`, since the CLI exits after each call and holds no idle timer to unload the model

### `src/cli/commands/model.ts`

Owns `model find`, which takes the flags `image find` takes plus `--size`, resolving the project and stem before any request the same way.

- Its JSON and human output both name Poly Haven, which the API's terms ask of any surface listing its models
- A saved model lands at `1k` textures unless `--size` names another, and a size the model lacks refuses `usage` with the sizes it offers

## Gotchas

- A key set to an empty string reads as unset, and `providerFailed` scrubs the key from a provider's echoed message
- `listAssets` skips `*.license.json`, so the Assets tab and the usage counts never draw a license file as a tile
- A CLI test hands the network in through `cli(argv, { fetch })`, which reaches the verbs as `CliIo.fetch`, and the fake Poly Haven lives in `test/support/polyhaven.ts`
- The board's `POST sourcing/generate` answers 403 `generate-off` until `sourcingRoutes` takes `generate: true`, since a frame's script still passes the writer guard and would spend the key
- A `serve` child in an e2e spec reaches Openverse through `e2e/support/openverse-stub.mjs`, preloaded with `NODE_OPTIONS=--import`, since the server's `fetch` is out of the spec's reach
