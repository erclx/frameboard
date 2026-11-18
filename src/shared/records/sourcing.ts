import { z } from 'zod'

/**
 * The suffix of the file a saved image's license sits in beside it, so
 * `house.jpg` carries `house.jpg.license.json`.
 */
export const LICENSE_FILE_SUFFIX = '.license.json'

/** The hosted providers `image generate` can run on, in the order it tries them. */
export const IMAGE_PROVIDERS = ['fal', 'google'] as const

export type ImageProviderName = (typeof IMAGE_PROVIDERS)[number]

/** One image a search found, numbered from 1 in the order the source ranked it. */
export const imageResultSchema = z.object({
  number: z.int().min(1),
  /** The source's own id, which `--save` takes in place of the number. */
  id: z.string(),
  title: z.string().nullable(),
  creator: z.string().nullable(),
  creatorUrl: z.string().nullable(),
  /** The license code the source gives, such as `cc0`, `pdm`, or `by`. */
  license: z.string(),
  licenseVersion: z.string().nullable(),
  licenseUrl: z.string().nullable(),
  /** The credit line the source writes for the image. */
  attribution: z.string().nullable(),
  /** The page the image was published on. */
  landingUrl: z.string().nullable(),
  /** The full image. */
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
  /** The license codes the search allowed. */
  licenses: z.array(z.string()),
  results: z.array(imageResultSchema),
})

export type ImageFind = z.infer<typeof imageFindSchema>

const foundLicenseSchema = z.object({
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
  /** ISO 8601. */
  savedAt: z.string(),
})

/** The `<file>.license.json` beside every saved image, saying where it came from. */
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
  /** Relative to the project's `assets/`, always `<path>.license.json`. */
  licensePath: z.string(),
  license: licenseFileSchema,
})

export type SavedImage = z.infer<typeof savedImageSchema>

/** What `image generate` answers, with `saved` null on a dry run. */
export const imageGenerateSchema = z.object({
  version: z.literal(1),
  provider: z.enum(IMAGE_PROVIDERS),
  model: z.string(),
  prompt: z.string(),
  /** The size the provider produces, which may round the size asked for. */
  width: z.int(),
  height: z.int(),
  /** The price estimated before the call, in US dollars. */
  priceUsd: z.number(),
  dryRun: z.boolean(),
  saved: savedImageSchema.nullable(),
})

export type ImageGenerate = z.infer<typeof imageGenerateSchema>

/** What `image doctor` answers, naming each key as set or unset and never its value. */
export const imageDoctorSchema = z.object({
  version: z.literal(1),
  /** The first GPU `nvidia-smi` reports, null when it is absent or fails. */
  gpu: z.object({ name: z.string(), memoryMiB: z.int() }).nullable(),
  /** The ComfyUI server at `FRAMEBOARD_COMFYUI_URL`, or the default address. */
  local: z.object({ url: z.string(), running: z.boolean() }),
  /** Each provider key by its environment variable, true when set and not empty. */
  keys: z.record(z.string(), z.boolean()),
  /** Each hosted provider in the order `image generate` tries them. */
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
