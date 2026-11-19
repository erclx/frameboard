---
title: Sourcing
description: The image verbs that find a public domain photo or generate one on the developer's key, saving it into a project's assets with a license file
---

# Sourcing

## Overview

Owns where a picture in a frame comes from, being the `image find`, `image generate`, and `image doctor` verbs and the code saving what they fetch into a project's `assets/`. Every saved image carries a `<file>.license.json` beside it, so a reader can tell where it came from.

## Layout

### `src/server/sourcing/`

Owns finding, generating, and saving, apart from `src/cli/` because the board's routes in `src/server/routes/sourcing.ts` call the same modules. Each module takes `fetch` as an argument rather than reaching for the global, so tests pass a fake and make no real call.

- `openverse.ts` searches with no key, under `cc0` and `pdm` alone unless `--credited` adds `by`, and refuses an id under a license the flags do not allow
- `polyhaven.ts` ranks Poly Haven's whole model list locally, having no search to call, and `pack-glb.ts` packs one size's glTF, read at `gltf['1k'].gltf`, into a GLB
- `save.ts` holds a download whole before any write, lands an image or a packed model through `addAssets`, and names the license file after it, taking the file back out when that write fails
- `generate.ts` picks the provider named, else the first in `PROVIDERS` whose key is set, and prices it with no request, so `--dry-run` and a refusal spend nothing
- `doctor.ts` reads the GPU through `nvidia-smi` and probes ComfyUI's `/system_stats` at `FRAMEBOARD_COMFYUI_URL`, reporting each key as a boolean

### `src/server/sourcing/providers/`

Owns one module per hosted provider behind the `ImageProvider` interface in `provider.ts`, which keeps a provider from importing `generate.ts` back.

- `fal.ts` runs FLUX.1 schnell with `sync_mode`, so the image comes back inline
- `google.ts` runs `gemini-nano-banana-2.1` on the Interactions API at 1K, at the aspect ratio nearest the size asked

### `src/cli/commands/image.ts`

Owns the three verbs. It resolves the project and the file stem before any request, so a refusal on either spends nothing, and it reads keys from the environment at call time and never stores one.

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
