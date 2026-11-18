import type { Command } from 'commander'

import { resolveProject } from '@/server/board/refs'
import {
  foundLicense,
  imageById,
  licensesFor,
  type OpenverseImage,
  searchImages,
} from '@/server/sourcing/openverse'
import { downloadImage, savedStem, saveImage } from '@/server/sourcing/save'
import { FrameboardError } from '@/shared/errors'
import type { ImageFind, SavedImage } from '@/shared/records/sourcing'

import {
  act,
  addVerb,
  boardOf,
  type CommonOptions,
  type ProgramContext,
} from '../program'

interface FindOptions extends CommonOptions {
  credited?: boolean
  save?: string
  name?: string
}

export function registerImage(program: Command, context: ProgramContext): void {
  const { io } = context
  const send = io.fetch ?? fetch
  const image = program
    .command('image')
    .description(
      "Find an openly licensed image and save it into a project's assets with its license",
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
