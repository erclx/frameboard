import type { Command } from 'commander'

import { resolveProject } from '@/server/board/refs'
import { freeMemory } from '@/server/sourcing/comfyui/client'
import { readWorkflow } from '@/server/sourcing/comfyui/workflow'
import { comfyuiUrl, diagnose, runNvidiaSmi } from '@/server/sourcing/doctor'
import { generateImage, planGeneration } from '@/server/sourcing/generate'
import {
  foundLicense,
  imageById,
  licensesFor,
  type OpenverseImage,
  searchImages,
} from '@/server/sourcing/openverse'
import { downloadImage, savedStem, saveImage } from '@/server/sourcing/save'
import { FrameboardError } from '@/shared/errors'
import {
  IMAGE_PROVIDERS,
  type ImageFind,
  type ImageFree,
  type ImageGenerate,
  type SavedImage,
} from '@/shared/records/sourcing'

import {
  act,
  addVerb,
  boardOf,
  type CommonOptions,
  parseInteger,
  type ProgramContext,
} from '../program'

interface FindOptions extends CommonOptions {
  credited?: boolean
  save?: string
  name?: string
}

interface GenerateOptions extends CommonOptions {
  provider?: string
  workflow?: string
  width: number
  height: number
  dryRun?: boolean
  name?: string
}

export function registerImage(program: Command, context: ProgramContext): void {
  const { io } = context
  const send = io.fetch ?? fetch
  const image = program
    .command('image')
    .description(
      "Find an openly licensed image or generate one, saving it into a project's assets with its license",
    )

  act<FindOptions>(
    addVerb(
      image,
      'find',
      'Search Openverse for public domain images, writing nothing unless --save names a result',
      { project: true },
    )
      .argument('<query>', 'what the image shows')
      .option(
        '--credited',
        'also allow images whose license asks only for credit, CC BY',
      )
      .option(
        '--save <number-or-id>',
        "save the result with this number, or the Openverse image with this id, into the project's assets",
      )
      .option(
        '--name <stem>',
        'the saved file name without its extension, the query by default',
      ),
    context,
    async ([query = ''], options) => {
      const search = { credited: options.credited ?? false }
      if (options.save === undefined) {
        if (options.name !== undefined) {
          throw new FrameboardError('usage', '--name needs --save.')
        }
        const results = await searchImages(query, search, send)
        const record: ImageFind = {
          version: 1,
          query,
          licenses: licensesFor(search),
          results,
        }
        return {
          data: record,
          human:
            results.length === 0
              ? `No image under ${record.licenses.join(', ')} matches ${query}`
              : results
                  .map(
                    (each) =>
                      `${each.number}\t${each.license}\t${each.title ?? each.id}\t${each.id}`,
                  )
                  .join('\n'),
        }
      }

      // Resolved ahead of the search, so a missing project spends no request.
      const stem = savedStem(options.name, query)
      const project = await resolveProject(
        await boardOf(options, io),
        options.project,
      )
      const chosen = await pick(query, options.save, search)
      const saved = await saveImage(
        project,
        stem,
        await downloadImage(chosen.image.url, send),
        foundLicense(chosen.image, chosen.query, new Date()),
      )
      return { data: saved, human: savedLine(saved) }
    },
  )

  act<GenerateOptions>(
    addVerb(
      image,
      'generate',
      "Generate an image on the first provider whose key is set and save it into the project's assets, spending on that key unless --dry-run",
      { project: true },
    )
      .argument('<prompt>', 'what the image shows')
      .option(
        '--provider <name>',
        `run on this provider, one of ${IMAGE_PROVIDERS.join(', ')}, rather than the first ready`,
      )
      .option(
        '--workflow <file>',
        'run this ComfyUI workflow in the API format on comfyui, with {{prompt}} and optionally {{width}}, {{height}}, and {{seed}} in it',
      )
      .option('--width <px>', 'the width asked for', parseInteger(1), 1024)
      .option('--height <px>', 'the height asked for', parseInteger(1), 1024)
      .option(
        '--dry-run',
        'answer the provider, size, and price, and make no request',
      )
      .option(
        '--name <stem>',
        'the saved file name without its extension, the prompt by default',
      ),
    context,
    async ([prompt = ''], options) => {
      // Read ahead of the plan, so a dry run checks the file and a bad one spends nothing.
      const workflow =
        options.workflow === undefined
          ? undefined
          : {
              name: options.workflow,
              graph: await readWorkflow(options.workflow),
            }
      const plan = planGeneration(
        {
          prompt,
          size: { width: options.width, height: options.height },
          provider: options.provider,
          workflow,
        },
        process.env,
      )
      const record: ImageGenerate = {
        version: 1,
        provider: plan.provider.name,
        model: plan.model,
        prompt,
        ...plan.size,
        priceUsd: plan.priceUsd,
        dryRun: options.dryRun ?? false,
        saved: null,
      }
      const priced = `${record.provider} ${record.model} at ${record.width}x${record.height} for about $${record.priceUsd}`
      if (record.dryRun) {
        return { data: record, human: `Would generate on ${priced}` }
      }
      // Resolved ahead of the call, so a missing project or a bad name spends nothing.
      const stem = savedStem(options.name, prompt)
      const project = await resolveProject(
        await boardOf(options, io),
        options.project,
      )
      const bytes = await generateImage(plan, send)
      const saved = await saveImage(project, stem, bytes, {
        version: 1,
        origin: 'generated',
        provider: record.provider,
        model: record.model,
        prompt,
        width: record.width,
        height: record.height,
        priceUsd: record.priceUsd,
        // A hosted provider ignores the seed, so only a local run records one.
        ...(plan.provider.name === 'comfyui' && { seed: plan.seed }),
        ...(plan.workflow && { workflow: plan.workflow.name }),
        savedAt: new Date().toISOString(),
      })
      return {
        data: { ...record, saved },
        human: `Generated on ${priced}. ${savedLine(saved)}`,
      }
    },
  )

  act<CommonOptions>(
    addVerb(
      image,
      'doctor',
      'Report the GPU, a local ComfyUI server, and which provider keys are set, installing nothing',
    ),
    context,
    async () => {
      const report = await diagnose({
        env: process.env,
        send,
        queryGpu: runNvidiaSmi,
      })
      return {
        data: report,
        human: [
          `GPU\t${report.gpu === null ? 'none found' : `${report.gpu.name}, ${report.gpu.memoryMiB} MiB`}`,
          `Local\t${report.local.url} ${report.local.running ? 'answers' : 'does not answer'}`,
          ...report.providers.map(
            (each) =>
              `${each.provider}\t${each.key} ${each.ready ? 'set' : 'unset'}`,
          ),
          `Generate runs on\t${report.provider ?? 'nothing, since no key is set'}`,
        ].join('\n'),
      }
    },
  )

  act<CommonOptions>(
    addVerb(
      image,
      'free',
      'Ask the ComfyUI server to unload its models and free their memory, which the next generate loads again',
    ),
    context,
    async () => {
      const url = comfyuiUrl(process.env)
      await freeMemory(url, send)
      const record: ImageFree = { version: 1, url, freed: true }
      return { data: record, human: `Freed the models ${url} held` }
    },
  )

  /** The result `--save` names: a number reruns the search, anything else is an id. */
  async function pick(
    query: string,
    save: string,
    search: { credited: boolean },
  ): Promise<{ image: OpenverseImage; query: string | null }> {
    if (!/^\d+$/.test(save)) {
      return { image: await imageById(save, search, send), query: null }
    }
    const number = Number(save)
    const results = await searchImages(query, search, send)
    const found = results.find((each) => each.number === number)
    if (found === undefined) {
      throw new FrameboardError(
        'result-not-found',
        `The search for ${query} found ${results.length} results, so there is no result ${number}.`,
        { number, results: results.length },
      )
    }
    return { image: found, query }
  }
}

function savedLine(saved: SavedImage): string {
  return `Saved assets/${saved.path} into ${saved.project}, its license in assets/${saved.licensePath}`
}
