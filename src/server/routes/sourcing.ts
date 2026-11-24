import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { type Context, Hono } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { z } from 'zod'

import type { JournalOptions } from '@/server/board/journal'
import { listFonts } from '@/server/fonts/installed'
import { removeFont } from '@/server/fonts/remove'
import type { History } from '@/server/history/stack'
import {
  fetchFamilies,
  FONTSOURCE_SOURCE,
  installFont,
  type ListedFamily,
  searchFamilies,
} from '@/server/sourcing/fontsource'
import {
  type Environment,
  generateImage,
  planGeneration,
  PROVIDERS,
} from '@/server/sourcing/generate'
import {
  foundLicense,
  imageById,
  licensesFor,
  searchImages,
} from '@/server/sourcing/openverse'
import {
  DEFAULT_MODEL_SIZE,
  fetchModel,
  modelById,
  POLYHAVEN_SOURCE,
  polyhavenLicense,
  searchModels,
} from '@/server/sourcing/polyhaven'
import {
  downloadImage,
  savedStem,
  saveImage,
  saveModel,
} from '@/server/sourcing/save'
import { type ErrorCode, FrameboardError } from '@/shared/errors'
import { FONT_CATEGORIES, FONT_LICENSES } from '@/shared/fonts'
import { isValidName } from '@/shared/names'
import type {
  FontFind,
  ImageFind,
  ImageGenerate,
  ImageOffer,
  ModelFind,
  SavedFont,
  SavedImage,
  SavedModel,
} from '@/shared/records/sourcing'

import { type Access, requireWriter } from '../access/guard'
import { parseBody } from './envelope'

/** How long a search waits on Openverse before the panel says it did not answer. */
export const FIND_TIMEOUT_MS = 15_000

/** How long each request of a save, its lookup and its download, may take. */
export const SAVE_TIMEOUT_MS = 60_000

/**
 * How long each request of a model or font save may take, longer than an
 * image's, since a model's textures or a font's subsets download together.
 */
export const PACK_SAVE_TIMEOUT_MS = 180_000

/** How long a provider may take, so a provider that never answers frees the button. */
export const GENERATE_TIMEOUT_MS = 120_000

/** The size the panel asks a provider for, the verb's own default. */
const GENERATE_SIZE = { width: 1024, height: 1024 }

export interface SourcingRoutesOptions {
  /** Reaches the sources, the image hosts, and the providers, the global `fetch` unless given. */
  send?: typeof fetch
  /** Where a provider's key is read, the server's own environment unless given. */
  env?: Environment
  /** Records a font's install and removal, each as one undo step, absent where nothing undoes. */
  history?: History
}

const queryLimit = z.string().trim().min(1).max(200)

const saveBodySchema = z.object({
  id: z.string().min(1).max(200),
  query: queryLimit,
  credited: z.boolean().default(false),
})

const modelSaveBodySchema = z.object({
  id: z.string().min(1).max(200),
  query: queryLimit,
})

const fontQuerySchema = z
  .object({
    query: z.string().trim().max(200),
    category: z.enum(FONT_CATEGORIES).nullable(),
  })
  .refine(({ query, category }) => query !== '' || category !== null)

const fontSaveBodySchema = z.object({
  id: z.string().min(1).max(200),
  /** The search that found it, null or absent when it is installed by id alone. */
  query: queryLimit.nullable().default(null),
  /** The weights kept of a static family, the usual two when absent. */
  weights: z.array(z.int().min(1).max(1000)).min(1).max(20).optional(),
})

const fontRemoveBodySchema = z.object({ id: z.string().min(1).max(200) })

/** `?frames=false` skips reading every frame for each font's `frames`, which only a removal reads. */
const framesQuerySchema = z.enum(['true', 'false']).optional()

const generateBodySchema = z.object({
  prompt: z.string().trim().min(1).max(2000),
})

const STATUS: Partial<Record<ErrorCode, ContentfulStatusCode>> = {
  usage: 400,
  'invalid-name': 400,
  'project-not-found': 404,
  'result-not-found': 404,
  'font-not-found': 404,
  'name-taken': 409,
  'no-provider': 409,
  'asset-type-refused': 422,
  'license-refused': 422,
  'source-failed': 502,
  'provider-failed': 502,
}

/**
 * A project's sourcing under `/api/projects/:project/sourcing`, calling the
 * modules the `image`, `model`, and `font` verbs call. Finding, listing, and the
 * provider's price read only; the rest need a writer. No answer carries a key.
 */
export function sourcingRoutes(
  root: string,
  access: Access,
  {
    send = (input, init) => fetch(input, init),
    env = process.env,
    history,
  }: SourcingRoutesOptions = {},
): Hono {
  const app = new Hono()
  const authorized = requireWriter(access)
  const base = '/api/projects/:project/sourcing'
  // Concurrent saves of one result share one write, so a double press lands one file.
  const saving = new Map<string, Promise<SavedImage>>()
  const savingModel = new Map<string, Promise<SavedModel>>()
  const savingFont = new Map<string, Promise<SavedFont>>()
  // Fontsource's one list answers every search, so it is fetched once for the server's life.
  let families: Promise<ListedFamily[]> | undefined
  let generating = false

  const listed = (): Promise<ListedFamily[]> =>
    (families ??= fetchFamilies(timed(send, FIND_TIMEOUT_MS)).catch(
      (error: unknown) => {
        families = undefined
        throw error
      },
    ))

  /** Runs one font write, recording it as an undo step where the board keeps a history. */
  const undoable = async <T>(
    write: (options: JournalOptions) => Promise<T>,
  ): Promise<T> => {
    if (history === undefined) return write({})
    const journal = history.journal()
    const result = await write({ journal })
    history.record({
      id: journal.id,
      changes: journal.changes,
      page: null,
      frames: [],
    })
    return result
  }

  app.onError((error, c) => answer(error, c))

  app.get(`${base}/find`, async (c) => {
    projectOf(root, c.req.param('project'))
    const query = queryLimit.safeParse(c.req.query('q') ?? '')
    if (!query.success) {
      throw new FrameboardError(
        'usage',
        'Send ?q=<what the image shows>, up to 200 characters.',
      )
    }
    const search = { credited: c.req.query('credited') === 'true' }
    const record: ImageFind = {
      version: 1,
      query: query.data,
      licenses: licensesFor(search),
      results: await searchImages(
        query.data,
        search,
        timed(send, FIND_TIMEOUT_MS),
      ),
    }
    return c.json({ ok: true, data: record })
  })

  app.post(`${base}/save`, authorized, async (c) => {
    const project = projectOf(root, c.req.param('project'))
    const body = await parseBody(c.req.raw, saveBodySchema)
    const key = JSON.stringify([project.name, body.id, body.credited])
    let pending = saving.get(key)
    if (pending === undefined) {
      pending = saveFound(project, body, timed(send, SAVE_TIMEOUT_MS)).finally(
        () => saving.delete(key),
      )
      saving.set(key, pending)
    }
    return c.json({ ok: true, data: await pending })
  })

  app.get(`${base}/models`, async (c) => {
    projectOf(root, c.req.param('project'))
    const query = queryLimit.safeParse(c.req.query('q') ?? '')
    if (!query.success) {
      throw new FrameboardError(
        'usage',
        'Send ?q=<what the model shows>, up to 200 characters.',
      )
    }
    const record: ModelFind = {
      version: 1,
      query: query.data,
      source: { ...POLYHAVEN_SOURCE },
      results: await searchModels(query.data, timed(send, FIND_TIMEOUT_MS)),
    }
    return c.json({ ok: true, data: record })
  })

  app.post(`${base}/models/save`, authorized, async (c) => {
    const project = projectOf(root, c.req.param('project'))
    const body = await parseBody(c.req.raw, modelSaveBodySchema)
    const key = JSON.stringify([project.name, body.id])
    let pending = savingModel.get(key)
    if (pending === undefined) {
      pending = saveFoundModel(
        project,
        body,
        timed(send, PACK_SAVE_TIMEOUT_MS),
      ).finally(() => savingModel.delete(key))
      savingModel.set(key, pending)
    }
    return c.json({ ok: true, data: await pending })
  })

  app.get(`${base}/fonts`, async (c) => {
    projectOf(root, c.req.param('project'))
    const asked = fontQuerySchema.safeParse({
      query: c.req.query('q') ?? '',
      category: c.req.query('category') ?? null,
    })
    if (!asked.success) {
      throw new FrameboardError(
        'usage',
        `Send ?q=<a family name>, up to 200 characters, or ?category=<one of ${FONT_CATEGORIES.join(', ')}>.`,
      )
    }
    const { query, category } = asked.data
    const search = { query: query === '' ? null : query, category }
    const record: FontFind = {
      version: 1,
      ...search,
      licenses: [...FONT_LICENSES],
      source: { ...FONTSOURCE_SOURCE },
      ...searchFamilies(await listed(), search),
    }
    return c.json({ ok: true, data: record })
  })

  app.get(`${base}/fonts/installed`, async (c) => {
    const { name } = projectOf(root, c.req.param('project'))
    const asked = framesQuerySchema.safeParse(c.req.query('frames'))
    if (!asked.success) {
      throw new FrameboardError(
        'usage',
        'Send ?frames=false to skip reading frames, or leave it out.',
      )
    }
    const frames = asked.data !== 'false'
    return c.json({ ok: true, data: await listFonts(root, name, { frames }) })
  })

  app.post(`${base}/fonts/save`, authorized, async (c) => {
    const project = projectOf(root, c.req.param('project'))
    const body = await parseBody(c.req.raw, fontSaveBodySchema)
    const key = JSON.stringify([project.name, body.id, body.weights])
    let pending = savingFont.get(key)
    if (pending === undefined) {
      pending = undoable((options) =>
        installFont(
          project,
          { ...body, savedAt: new Date() },
          timed(send, PACK_SAVE_TIMEOUT_MS),
          options,
        ),
      ).finally(() => savingFont.delete(key))
      savingFont.set(key, pending)
    }
    return c.json({ ok: true, data: await pending })
  })

  app.post(`${base}/fonts/remove`, authorized, async (c) => {
    const { name } = projectOf(root, c.req.param('project'))
    const { id } = await parseBody(c.req.raw, fontRemoveBodySchema)
    const removed = await undoable((options) =>
      removeFont(root, name, id, options),
    )
    return c.json({ ok: true, data: removed })
  })

  app.get(`${base}/provider`, (c) => {
    projectOf(root, c.req.param('project'))
    return c.json({ ok: true, data: offer(env) })
  })

  app.post(`${base}/generate`, authorized, async (c) => {
    const project = projectOf(root, c.req.param('project'))
    const { prompt } = await parseBody(c.req.raw, generateBodySchema)
    if (generating) {
      return c.json(
        {
          ok: false,
          error: {
            code: 'generate-busy',
            message: 'An image is already generating. Wait for it to land.',
          },
        },
        429,
      )
    }
    const plan = planGeneration({ prompt, size: GENERATE_SIZE }, env)
    generating = true
    try {
      // The request's own signal is not passed on, so a tab closed mid-run still saves what it paid for.
      const bytes = await generateImage(plan, timed(send, GENERATE_TIMEOUT_MS))
      const saved = await saveImage(
        project,
        savedStem(undefined, prompt),
        bytes,
        {
          version: 1,
          origin: 'generated',
          provider: plan.provider.name,
          model: plan.provider.model,
          prompt,
          ...plan.size,
          priceUsd: plan.priceUsd,
          // A hosted provider ignores the seed, so only a local run records one.
          ...(plan.provider.name === 'comfyui' && { seed: plan.seed }),
          savedAt: new Date().toISOString(),
        },
      )
      const record: ImageGenerate = {
        version: 1,
        provider: plan.provider.name,
        model: plan.provider.model,
        prompt,
        ...plan.size,
        priceUsd: plan.priceUsd,
        dryRun: false,
        saved,
      }
      return c.json({ ok: true, data: record })
    } finally {
      generating = false
    }
  })

  return app
}

async function saveFound(
  project: { name: string; path: string },
  body: z.infer<typeof saveBodySchema>,
  send: typeof fetch,
): Promise<SavedImage> {
  // Read again by id, so the license file records what Openverse holds rather than what a tab sent.
  const image = await imageById(body.id, { credited: body.credited }, send)
  return saveImage(
    project,
    savedStem(undefined, body.query),
    await downloadImage(image.url, send),
    foundLicense(image, body.query, new Date()),
  )
}

async function saveFoundModel(
  project: { name: string; path: string },
  body: z.infer<typeof modelSaveBodySchema>,
  send: typeof fetch,
): Promise<SavedModel> {
  // Read again by id, so the license file records what Poly Haven holds rather than what a tab sent.
  const model = await modelById(body.id, send)
  const packed = await fetchModel(model.id, DEFAULT_MODEL_SIZE, send)
  return saveModel(
    project,
    savedStem(undefined, body.query, 'model'),
    packed.bytes,
    polyhavenLicense(
      model,
      body.query,
      { url: packed.url, size: DEFAULT_MODEL_SIZE },
      new Date(),
    ),
  )
}

/** The provider a generation would run on and its price, naming each key by its variable alone. */
function offer(env: Environment): ImageOffer {
  const keys = PROVIDERS.map((provider) => provider.keyEnv)
  try {
    const plan = planGeneration({ prompt: '', size: GENERATE_SIZE }, env)
    return {
      version: 1,
      provider: {
        name: plan.provider.name,
        model: plan.provider.model,
        key: plan.provider.keyEnv,
        ...plan.size,
        priceUsd: plan.priceUsd,
      },
      keys,
    }
  } catch (error) {
    if (!(error instanceof FrameboardError) || error.code !== 'no-provider')
      throw error
    return { version: 1, provider: null, keys }
  }
}

function projectOf(root: string, name: string): { name: string; path: string } {
  const path = join(root, name)
  if (!isValidName(name) || !existsSync(path)) {
    throw new FrameboardError(
      'project-not-found',
      `No project named ${name} in this board.`,
    )
  }
  return { name, path }
}

/** `send` with every request abandoned after `ms`, which the modules report as their source not answering. */
function timed(send: typeof fetch, ms: number): typeof fetch {
  return ((input: Parameters<typeof fetch>[0], init?: RequestInit) =>
    send(input, { ...init, signal: AbortSignal.timeout(ms) })) as typeof fetch
}

function answer(error: Error, c: Context): Response {
  if (!(error instanceof FrameboardError)) throw error
  return c.json(
    {
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
    },
    STATUS[error.code] ?? 500,
  )
}
