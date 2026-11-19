import { readFile, stat } from 'node:fs/promises'
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path'

import { ASSETS_FOLDER } from '@/shared/board-files'
import { FrameboardError } from '@/shared/errors'
import {
  LICENSE_FILE_SUFFIX,
  licenseFileSchema,
  type SourcePicture,
} from '@/shared/records/sourcing'

import { runModelWorkflow, uploadImage } from './comfyui/client'
import { BUNDLED_MODEL_WORKFLOW, fillWorkflow } from './comfyui/workflow'
import type { Environment } from './generate'
import type { NamedWorkflow } from './providers/provider'

/** The environment variable naming the ComfyUI server a model is made on. */
export const COMFYUI_URL_ENV = 'FRAMEBOARD_COMFYUI_URL'

/** The model the bundled workflow runs, named by its file as the image provider names FLUX.2 klein. */
export const BUNDLED_MODEL = 'pixal3d-int8-convrot'

/** A picture read whole before any request, with where it came from. */
export interface Picture {
  bytes: Uint8Array
  /** The file's own name, which the upload sends. */
  name: string
  source: SourcePicture
}

/** A model generation decided, making no request. */
export interface ModelGenerationPlan {
  server: string
  /** The bundled model, or the workflow file's name when one is run. */
  model: string
  picture: Picture
  /** Drawn per call, so ComfyUI never answers a cached model for a repeated picture. */
  seed: number
  workflow?: NamedWorkflow
}

/**
 * The picture at `path`, read from `cwd`, the project, or its `assets/`, carrying a project asset's license forward.
 * Refuses `usage` for no file, or a file whose bytes are no PNG, JPEG, WebP, or GIF.
 */
export async function readPicture(
  path: string,
  cwd: string,
  project: { path: string },
): Promise<Picture> {
  const assets = join(project.path, ASSETS_FOLDER)
  const candidates = isAbsolute(path)
    ? [path]
    : [resolve(cwd, path), resolve(project.path, path), resolve(assets, path)]
  const found = await firstFile(candidates)
  if (found === null) {
    throw new FrameboardError(
      'usage',
      `No picture at ${path}, read from here, the project, or its ${ASSETS_FOLDER}/.`,
      { picture: path },
    )
  }
  const bytes = new Uint8Array(await readFile(found))
  const name = basename(found)
  if (!isPicture(bytes)) {
    throw new FrameboardError(
      'usage',
      `${name} is not a PNG, JPEG, WebP, or GIF picture, so there is nothing to make a model from.`,
      { picture: name },
    )
  }
  const inAssets = relative(assets, found)
  const isAsset =
    inAssets !== '' && !inAssets.startsWith('..') && !isAbsolute(inAssets)
  return {
    bytes,
    name,
    source: isAsset
      ? {
          path: inAssets.split(sep).join('/'),
          inAssets: true,
          license: await pictureLicense(found),
        }
      : { path: name, inAssets: false, license: null },
  }
}

/**
 * The server, model, and seed a generation runs with, making no request.
 * Refuses `no-provider` naming `FRAMEBOARD_COMFYUI_URL` while it is unset or
 * empty, since a model runs on the developer's own server alone.
 */
export function planModelGeneration(
  request: { picture: Picture; workflow?: NamedWorkflow },
  env: Environment,
  random: () => number = Math.random,
): ModelGenerationPlan {
  const server = env[COMFYUI_URL_ENV]?.trim()
  if (server === undefined || server === '') {
    throw new FrameboardError(
      'no-provider',
      `No ComfyUI server is set. Set ${COMFYUI_URL_ENV} in the environment, and run frameboard image doctor for the files Pixal3D needs.`,
      { keys: [COMFYUI_URL_ENV] },
    )
  }
  return {
    server,
    model: request.workflow ? basename(request.workflow.name) : BUNDLED_MODEL,
    picture: request.picture,
    seed: Math.floor(random() * Number.MAX_SAFE_INTEGER),
    ...(request.workflow && { workflow: request.workflow }),
  }
}

/**
 * Uploads the picture, runs the workflow on it, and answers the GLB's bytes,
 * the one point a generation reaches the server. Refuses `provider-failed`
 * on any failure the client reports.
 */
export async function generateModel(
  plan: ModelGenerationPlan,
  send: typeof fetch,
): Promise<Uint8Array> {
  const image = await uploadImage(
    plan.server,
    { name: plan.picture.name, bytes: plan.picture.bytes },
    send,
  )
  const graph = fillWorkflow(plan.workflow?.graph ?? BUNDLED_MODEL_WORKFLOW, {
    image,
    seed: plan.seed,
  })
  return runModelWorkflow(plan.server, graph, send)
}

async function firstFile(paths: readonly string[]): Promise<string | null> {
  for (const path of paths) {
    const found = await stat(path).catch(() => null)
    if (found?.isFile()) return path
  }
  return null
}

/** True for the leading bytes of a PNG, JPEG, WebP, or GIF, the pictures ComfyUI's LoadImage reads. */
function isPicture(bytes: Uint8Array): boolean {
  const starts = (offset: number, text: string) =>
    [...text].every((char, at) => bytes[offset + at] === char.charCodeAt(0))
  return (
    starts(0, '\x89PNG') ||
    (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) ||
    (starts(0, 'RIFF') && starts(8, 'WEBP')) ||
    starts(0, 'GIF8')
  )
}

/** The picture's own license file's origin and license name, null when it has none or one that does not parse. */
async function pictureLicense(path: string): Promise<SourcePicture['license']> {
  const text = await readFile(`${path}${LICENSE_FILE_SUFFIX}`, 'utf8').catch(
    () => null,
  )
  if (text === null) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  const license = licenseFileSchema.safeParse(parsed)
  if (!license.success) return null
  return license.data.origin === 'found'
    ? { origin: 'found', license: license.data.license }
    : { origin: 'generated', license: null }
}
