import { type Command, InvalidArgumentError } from 'commander'

import { resolveProject } from '@/server/board/refs'
import { readWorkflow } from '@/server/sourcing/comfyui/workflow'
import {
  generateModel,
  planModelGeneration,
  readPicture,
} from '@/server/sourcing/generate-model'
import {
  DEFAULT_MODEL_SIZE,
  fetchModel,
  modelById,
  POLYHAVEN_SOURCE,
  polyhavenLicense,
  type PolyHavenModel,
  searchModels,
} from '@/server/sourcing/polyhaven'
import { savedStem, saveModel } from '@/server/sourcing/save'
import { FrameboardError } from '@/shared/errors'
import {
  MODEL_SIZES,
  type ModelFind,
  type ModelGenerate,
  type ModelSize,
  type SavedModel,
} from '@/shared/records/sourcing'

import {
  act,
  addVerb,
  boardOf,
  type CommonOptions,
  type ProgramContext,
} from '../program'

interface FindOptions extends CommonOptions {
  save?: string
  size?: ModelSize
  name?: string
}

interface GenerateOptions extends CommonOptions {
  workflow?: string
  dryRun?: boolean
  name?: string
}

const CREDIT = `Models from ${POLYHAVEN_SOURCE.name}, ${POLYHAVEN_SOURCE.url}, CC0`

export function registerModel(program: Command, context: ProgramContext): void {
  const { io } = context
  const send = io.fetch ?? fetch
  const model = program
    .command('model')
    .description(
      "Find a public domain 3D model or make one from a picture, saving it into a project's assets as one GLB with its license",
    )

  act<FindOptions>(
    addVerb(
      model,
      'find',
      "Search Poly Haven's CC0 models, writing nothing unless --save names a result",
      { project: true },
    )
      .argument('<query>', 'what the model shows')
      .option(
        '--save <number-or-id>',
        "save the result with this number, or the Poly Haven model with this id, into the project's assets",
      )
      .option(
        '--size <size>',
        `the texture size saved, one of ${MODEL_SIZES.join(', ')}, ${DEFAULT_MODEL_SIZE} by default`,
        parseSize,
      )
      .option(
        '--name <stem>',
        'the saved file name without its extension, the query by default',
      ),
    context,
    async ([query = ''], options) => {
      if (options.save === undefined) {
        for (const flag of ['name', 'size'] as const) {
          if (options[flag] !== undefined) {
            throw new FrameboardError('usage', `--${flag} needs --save.`)
          }
        }
        const results = await searchModels(query, send)
        const record: ModelFind = {
          version: 1,
          query,
          source: { ...POLYHAVEN_SOURCE },
          results,
        }
        return {
          data: record,
          human:
            results.length === 0
              ? `No ${POLYHAVEN_SOURCE.name} model matches ${query}`
              : [
                  ...results.map(
                    (each) =>
                      `${each.number}\t${each.sizes.at(-1) ?? '-'}\t${each.name}\t${each.id}`,
                  ),
                  CREDIT,
                ].join('\n'),
        }
      }

      // Resolved ahead of the search, so a missing project spends no request.
      const stem = savedStem(options.name, query, 'model')
      const project = await resolveProject(
        await boardOf(options, io),
        options.project,
      )
      const size = options.size ?? DEFAULT_MODEL_SIZE
      const chosen = await pick(query, options.save)
      const packed = await fetchModel(chosen.model.id, size, send)
      const saved = await saveModel(
        project,
        stem,
        packed.bytes,
        polyhavenLicense(
          chosen.model,
          chosen.query,
          { url: packed.url, size },
          new Date(),
        ),
      )
      return { data: saved, human: savedLine(saved) }
    },
  )

  act<GenerateOptions>(
    addVerb(
      model,
      'generate',
      "Make a 3D model from a picture on the ComfyUI server at FRAMEBOARD_COMFYUI_URL and save it into the project's assets as one GLB with its license, in about a minute and with no progress line. Refuses no-provider while that address is unset",
      { project: true },
    )
      .argument(
        '<picture>',
        "a PNG, JPEG, WebP, or GIF, read from here, the project's folder, or its assets/",
      )
      .option(
        '--workflow <file>',
        'run this ComfyUI workflow in the API format, with {{image}} and optionally {{seed}} in it, rather than the bundled Pixal3D one',
      )
      .option(
        '--dry-run',
        'answer the server, model, and picture, and make no request',
      )
      .option(
        '--name <stem>',
        "the saved file name without its extension, the picture's by default",
      ),
    context,
    async ([path = ''], options) => {
      // Read ahead of the plan, so a dry run checks the file and a bad one reaches no server.
      const workflow =
        options.workflow === undefined
          ? undefined
          : {
              name: options.workflow,
              graph: await readWorkflow(options.workflow, 'model'),
            }
      const project = await resolveProject(
        await boardOf(options, io),
        options.project,
      )
      const picture = await readPicture(path, io.cwd, project)
      const stem = savedStem(
        options.name,
        picture.name.replace(/\.[^.]*$/, ''),
        'model',
      )
      const plan = planModelGeneration({ picture, workflow }, process.env)
      const record: ModelGenerate = {
        version: 1,
        provider: 'comfyui',
        server: plan.server,
        model: plan.model,
        picture: picture.source,
        dryRun: options.dryRun ?? false,
        saved: null,
      }
      const made = `${record.model} on ${record.server} from ${picture.source.path}`
      if (record.dryRun) {
        return { data: record, human: `Would generate ${made}` }
      }
      const glb = await generateModel(plan, send)
      const saved = await saveModel(project, stem, glb, {
        version: 1,
        origin: 'generated',
        kind: 'model',
        provider: 'comfyui',
        server: plan.server,
        model: plan.model,
        ...(plan.workflow && { workflow: plan.workflow.name }),
        picture: picture.source,
        seed: plan.seed,
        savedAt: new Date().toISOString(),
      })
      return {
        data: { ...record, saved },
        human: `Generated ${made}. Saved assets/${saved.path} into ${saved.project}, its license in assets/${saved.licensePath}`,
      }
    },
  )

  /** The model `--save` names: a number reruns the search, anything else is an id. */
  async function pick(
    query: string,
    save: string,
  ): Promise<{ model: PolyHavenModel; query: string | null }> {
    if (!/^\d+$/.test(save)) {
      return { model: await modelById(save, send), query: null }
    }
    const number = Number(save)
    const results = await searchModels(query, send)
    const found = results.find((each) => each.number === number)
    if (found === undefined) {
      throw new FrameboardError(
        'result-not-found',
        `The search for ${query} found ${results.length} results, so there is no result ${number}.`,
        { number, results: results.length },
      )
    }
    return { model: found, query }
  }
}

function parseSize(value: string): ModelSize {
  const size = MODEL_SIZES.find((each) => each === value)
  if (size === undefined) {
    throw new InvalidArgumentError(`Expected one of ${MODEL_SIZES.join(', ')}.`)
  }
  return size
}

function savedLine(saved: SavedModel): string {
  return `Saved assets/${saved.path} into ${saved.project} from ${POLYHAVEN_SOURCE.name}, its license in assets/${saved.licensePath}`
}
