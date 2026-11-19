import { z } from 'zod'

/** So `house.jpg` carries its license in `house.jpg.license.json` beside it. */
export const LICENSE_FILE_SUFFIX = '.license.json'

export const IMAGE_PROVIDERS = ['comfyui', 'fal', 'google'] as const

export type ImageProviderName = (typeof IMAGE_PROVIDERS)[number]

/** One image a search found, numbered from 1 in the order the source ranked it. */
export const imageResultSchema = z.object({
  number: z.int().min(1),
  /** The source's own id, which `--save` takes in place of the number. */
  id: z.string(),
  title: z.string().nullable(),
  creator: z.string().nullable(),
  creatorUrl: z.string().nullable(),
  license: z.string(),
  licenseVersion: z.string().nullable(),
  licenseUrl: z.string().nullable(),
  attribution: z.string().nullable(),
  landingUrl: z.string().nullable(),
  url: z.string(),
  thumbnail: z.string().nullable(),
  width: z.int().nullable(),
  height: z.int().nullable(),
})

export type ImageResult = z.infer<typeof imageResultSchema>

/** What `image find` answers without `--save`, writing nothing. */
export const imageFindSchema = z.object({
  version: z.literal(1),
  query: z.string(),
  licenses: z.array(z.string()),
  results: z.array(imageResultSchema),
})

export type ImageFind = z.infer<typeof imageFindSchema>

/** The texture sizes Poly Haven serves a model at, smallest first. */
export const MODEL_SIZES = ['1k', '2k', '4k', '8k', '16k'] as const

export type ModelSize = (typeof MODEL_SIZES)[number]

/** One Poly Haven model a search found, numbered from 1 in the order the ranking put it. */
export const modelResultSchema = z.object({
  number: z.int().min(1),
  /** Poly Haven's own id, which `--save` takes in place of the number. */
  id: z.string(),
  name: z.string(),
  authors: z.array(z.string()),
  categories: z.array(z.string()),
  tags: z.array(z.string()),
  license: z.literal('cc0'),
  /** The model's page on polyhaven.com. */
  landingUrl: z.string(),
  thumbnail: z.string().nullable(),
  polycount: z.int().nullable(),
  /** Poly Haven's x, y, and z extent in millimetres, z pointing up. */
  dimensionsMm: z.tuple([z.number(), z.number(), z.number()]).nullable(),
  /** The texture sizes `--size` may ask for, smallest first. */
  sizes: z.array(z.enum(MODEL_SIZES)),
  downloadCount: z.int().nullable(),
})

export type ModelResult = z.infer<typeof modelResultSchema>

/** What `model find` answers without `--save`, writing nothing. */
export const modelFindSchema = z.object({
  version: z.literal(1),
  query: z.string(),
  /** Who serves the results, which every surface listing them names. */
  source: z.object({ name: z.literal('Poly Haven'), url: z.string() }),
  results: z.array(modelResultSchema),
})

export type ModelFind = z.infer<typeof modelFindSchema>

const openverseLicenseSchema = z.object({
  version: z.literal(1),
  origin: z.literal('found'),
  source: z.literal('openverse'),
  id: z.string(),
  /** The search that found it, null when it was saved by id. */
  query: z.string().nullable(),
  title: z.string().nullable(),
  creator: z.string().nullable(),
  creatorUrl: z.string().nullable(),
  license: z.string(),
  licenseVersion: z.string().nullable(),
  licenseUrl: z.string().nullable(),
  attribution: z.string().nullable(),
  landingUrl: z.string().nullable(),
  url: z.string(),
  /** ISO 8601. */
  savedAt: z.string(),
})

const polyhavenLicenseSchema = z.object({
  version: z.literal(1),
  origin: z.literal('found'),
  source: z.literal('polyhaven'),
  id: z.string(),
  /** The search that found it, null when it was saved by id. */
  query: z.string().nullable(),
  title: z.string(),
  /** Recorded though CC0 asks no credit, since where a file came from outlives that question. */
  authors: z.array(z.string()),
  license: z.literal('cc0'),
  licenseUrl: z.string(),
  landingUrl: z.string(),
  /** The glTF the GLB was packed from. */
  url: z.string(),
  size: z.enum(MODEL_SIZES),
  savedAt: z.string(),
})

const foundLicenseSchema = z.discriminatedUnion('source', [
  openverseLicenseSchema,
  polyhavenLicenseSchema,
])

const generatedLicenseSchema = z.object({
  version: z.literal(1),
  origin: z.literal('generated'),
  provider: z.enum(IMAGE_PROVIDERS),
  model: z.string(),
  prompt: z.string(),
  width: z.int(),
  height: z.int(),
  /** The price estimated before the call, in US dollars. */
  priceUsd: z.number(),
  /** The noise seed a local run drew, so the same image can be made again. */
  seed: z.int().optional(),
  /** The workflow file `--workflow` named, absent for the bundled one. */
  workflow: z.string().optional(),
  savedAt: z.string(),
})

/** The `<file>.license.json` beside every saved image or model, saying where it came from. */
export const licenseFileSchema = z.discriminatedUnion('origin', [
  foundLicenseSchema,
  generatedLicenseSchema,
])

export type LicenseFile = z.infer<typeof licenseFileSchema>

/** An image saved into a project's `assets/`, with the license file written beside it. */
export const savedImageSchema = z.object({
  version: z.literal(1),
  project: z.string(),
  /** Relative to the project's `assets/`, the name the image landed under. */
  path: z.string(),
  licensePath: z.string(),
  license: licenseFileSchema,
})

export type SavedImage = z.infer<typeof savedImageSchema>

/** A model saved into a project's `assets/` as one `.glb`, with the license file written beside it. */
export const savedModelSchema = savedImageSchema

export type SavedModel = SavedImage

/** What `image generate` answers, with `saved` null on a dry run. */
export const imageGenerateSchema = z.object({
  version: z.literal(1),
  provider: z.enum(IMAGE_PROVIDERS),
  model: z.string(),
  prompt: z.string(),
  /** The size the provider produces, which may round the size asked for. */
  width: z.int(),
  height: z.int(),
  priceUsd: z.number(),
  dryRun: z.boolean(),
  saved: savedImageSchema.nullable(),
})

export type ImageGenerate = z.infer<typeof imageGenerateSchema>

/** What the board's Generate shows before a run: the provider it would use and its price, never a key's value. */
export const imageOfferSchema = z.object({
  version: z.literal(1),
  /** Whether the board may generate at all, false while generating from a tab is switched off. */
  enabled: z.boolean(),
  /** The first provider whose key is set, null when none is. */
  provider: z
    .object({
      name: z.enum(IMAGE_PROVIDERS),
      model: z.string(),
      /** The environment variable its key is read from. */
      key: z.string(),
      width: z.int(),
      height: z.int(),
      priceUsd: z.number(),
    })
    .nullable(),
  /** Every provider's key variable, in the order generation tries them. */
  keys: z.array(z.string()),
})

export type ImageOffer = z.infer<typeof imageOfferSchema>

/** What `image doctor` answers, naming each key as set or unset and never its value. */
export const imageDoctorSchema = z.object({
  version: z.literal(1),
  /** The first GPU `nvidia-smi` reports, null when it is absent or fails. */
  gpu: z.object({ name: z.string(), memoryMiB: z.int() }).nullable(),
  /** The ComfyUI server at `FRAMEBOARD_COMFYUI_URL`, or the default address. */
  local: z.object({ url: z.string(), running: z.boolean() }),
  /** Each provider key by its environment variable, true when set and not empty. */
  keys: z.record(z.string(), z.boolean()),
  providers: z.array(
    z.object({
      provider: z.enum(IMAGE_PROVIDERS),
      model: z.string(),
      key: z.string(),
      ready: z.boolean(),
    }),
  ),
  /** The provider `image generate` would run on now, null when none is ready. */
  provider: z.enum(IMAGE_PROVIDERS).nullable(),
})

export type ImageDoctor = z.infer<typeof imageDoctorSchema>
