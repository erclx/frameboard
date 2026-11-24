---
title: Sourcing
description: The image, model, and font verbs that find or generate a picture, a 3D model, or an openly licensed font, each saved into a project with its license
---

# Sourcing

## Overview

Owns where a picture, a 3D model, or a font in a frame comes from, being the `image`, `model`, and `font` verbs and the code saving what they fetch into a project's `assets/`. Every saved file carries a `<file>.license.json` beside it, or its folder's `font.license.json`, so a reader can tell where it came from.

## Layout

### `src/server/sourcing/`

Owns finding, generating, and saving, apart from `src/cli/` because the board's routes in `src/server/routes/sourcing.ts` call the same modules. Each module takes `fetch` as an argument rather than reaching for the global, so tests pass a fake and make no real call.

- `openverse.ts` searches with no key, under `cc0` and `pdm` alone unless `--credited` adds `by`, and refuses an id under a license the flags do not allow
- `polyhaven.ts` ranks Poly Haven's whole model list locally, having no search to call, and `pack-glb.ts` packs one size's glTF, read at `gltf['1k'].gltf`, into a GLB
- `save.ts` holds a download whole before any write, lands an image or a packed model through `addAssets`, and names the license file after it, taking the file back out when that write fails
- `generate.ts` picks the provider named, else the first in `PROVIDERS` whose key is set, and prices it with no request, so `--dry-run` and a refusal spend nothing

### `src/server/sourcing/fontsource.ts`

Owns finding and fetching a font family, apart from `save.ts` whose `saveFont` lands it, because a family is many files that stand or fall together.

- It ranks Fontsource's whole list locally as Poly Haven's is, and reads an install's sheets, files, and `LICENSE` from one npm package release, since the API carries no license text
- `saveFont` writes the WOFF2 files as served, the source's text as `LICENSE.txt`, and the record into a dot-named folder, then renames it to `assets/fonts/<id>/`, so a project holds all of it or none
- It refuses `name-taken` for any folder by that name, and `license-refused` for a license outside OFL-1.1, Apache-2.0, and UFL-1.0 comes ahead of any download
- Never rename, convert, or subset a saved file, since the Open Font License reserves a font's name against a modified one
- The Assets tab's delete, replace, and rename refuse `asset-not-found` for a file in an installed font's folder

### `src/server/sourcing/generate-model.ts`

Owns planning and running a model generation, apart from `generate.ts` because a model runs on the developer's own server alone and takes a picture rather than a prompt.

- It reads the picture from here, the project, or its `assets/`, and checks its bytes are a picture
- It carries a project asset's own license origin forward, and refuses `no-provider` while `FRAMEBOARD_COMFYUI_URL` is unset

### `src/server/sourcing/doctor.ts`

Owns `image doctor`'s reading, the GPU through `nvidia-smi` and ComfyUI's version and both bundled workflows' files, each tagged with its verb.

- It builds setup steps it prints and never runs
- Its start command passes `--reserve-vram` at a tenth of the card, since Frameboard never starts the server and a run is capped at 90 percent

### `src/server/sourcing/comfyui/`

Owns talking to a ComfyUI server the developer starts, apart from the providers because 3D generation reuses it.

- `client.ts` posts `/prompt`, polls `/history/<id>`, and reads the first saved image, or the first GLB under a node's `3d` output, from `/view`
- It uploads a picture to `/upload/image` and posts `/free`, under any path the address carries
- An upload never overwrites, so a run fills the name the server answered rather than the one sent
- A run waits up to `RUN_TIMEOUT_MS`, since a first call loads the model for 20 seconds or more

### `src/server/sourcing/comfyui/workflow.ts`

Owns the workflows a run sends, filling their inputs from placeholders.

- It fills `{{prompt}}`, `{{image}}`, `{{width}}`, `{{height}}`, and `{{seed}}`, a lone number placeholder as a number
- It refuses `usage` for an image workflow with no `{{prompt}}` or a model one with no `{{image}}`
- `flux2-klein.json` beside it is the bundled FLUX.2 klein 4B workflow an image run takes without `--workflow`
- `pixal3d.json` is the bundled Pixal3D workflow a model run takes, at 100,000 triangles and 2048 px textures, its four sampler seeds all `{{seed}}`

### `src/server/sourcing/providers/`

Owns one module per provider behind the `ImageProvider` interface in `provider.ts`, which keeps a provider from importing `generate.ts` back.

- `fal.ts` runs FLUX.1 schnell with `sync_mode`, so the image comes back inline
- `google.ts` runs `gemini-nano-banana-2.1` on the Interactions API at 1K, at the aspect ratio nearest the size asked
- `comfyui.ts` takes `FRAMEBOARD_COMFYUI_URL` as its key and prices every image at 0, running the bundled workflow or the developer's own
- `PROVIDERS` tries `comfyui` first, and each call draws a seed, since ComfyUI answers a cached image for a repeated prompt

### `src/cli/commands/image.ts`

Owns the four `image` verbs. It resolves the project and the file stem before any request, so a refusal on either spends nothing, and it reads keys from the environment at call time and never stores one.

- `generate --workflow <file>` reads and checks the file ahead of the plan, so a dry run catches a bad one, and runs on `comfyui` alone, refusing `usage` beside another `--provider`
- A local run's license records the seed it drew and any workflow file, so one image can be made again
- `free` posts `/free`, since the CLI exits after each call and holds no idle timer to unload the model

### `src/cli/commands/model.ts`

Owns `model find`, which takes the flags `image find` takes plus `--size`, and `model generate <picture>`, each resolving everything it reads before any request, so a dry run or a refusal reaches no server.

- `find` output names Poly Haven, which the API's terms ask of any surface listing its models, and saves at `1k` textures unless `--size` names a size the model offers
- A generated model's license carries `kind: 'model'`, the server, the model or workflow file, the seed, and the picture, beside the image license, which carries no `kind`
- A picture outside the project's `assets/` is named by its file name alone, never a path on the machine
- It shows no progress, since ComfyUI reports progress only over its socket

### `src/cli/commands/font.ts`

Owns `font find`, `font list`, and `font remove`, the last two over `src/server/fonts/`. The board's routes under `sourcing/fonts` answer the same records and hold Fontsource's list for the server's life.

- `find` takes a query, `--category`, or both, and lists only families under the three licenses
- A variable family keeps every subset and weight, and a static one 400 and 700 or the weights `--weights` names
- The routes record an install and a removal as one undo step each, which the verbs never do

## Gotchas

- A key set to an empty string reads as unset, and `providerFailed` scrubs the key from a provider's echoed message
- `listAssets` skips `*.license.json`, so the Assets tab and the usage counts never draw a license file as a tile
- A CLI test hands the network in through `cli(argv, { fetch })`, which reaches the verbs as `CliIo.fetch`, with fakes in `test/support/polyhaven.ts`, `fontsource.ts`, and `comfyui.ts`
- The board's `POST sourcing/generate` builds its own license apart from `image generate`, so a field the verb starts recording, as the seed was, has to land in `src/server/routes/sourcing.ts` too
- An e2e child reaches each source through a stub in `e2e/support/`, such as `fontsource-stub.mjs`, preloaded by `NODE_OPTIONS=--import`, past the spec's reach
