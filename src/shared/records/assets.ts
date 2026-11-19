import { z } from 'zod'

import { ASSET_KINDS } from '../asset-kinds'

export const assetFileSchema = z.object({
  /** Relative to the project's `assets/`, with `/` between segments. */
  path: z.string(),
  kind: z.enum(ASSET_KINDS),
  /** Bytes. */
  size: z.number().int().nonnegative(),
  /** How many frames link the file, each counted once, absent where the server counts none. */
  frames: z.number().int().nonnegative().optional(),
})

export type AssetFile = z.infer<typeof assetFileSchema>

/** The files in a project's `assets/` by path, empty when the folder is missing. */
export const assetListSchema = z.object({
  files: z.array(assetFileSchema),
})

export type AssetList = z.infer<typeof assetListSchema>

export const assetAddResultSchema = z.object({
  /** Each landed file with the name it was dropped as and the name it took. */
  added: z.array(z.object({ name: z.string(), path: z.string() })),
  /** Each file left out, by its dropped name, with the error code that says why. */
  refused: z.array(
    z.object({ name: z.string(), code: z.string(), message: z.string() }),
  ),
})

export type AssetAddResult = z.infer<typeof assetAddResultSchema>

/** A rename's body: the file's new name in its own folder, keeping its extension. */
export const assetRenameSchema = z.object({ name: z.string().min(1) })

export type AssetRename = z.infer<typeof assetRenameSchema>

/**
 * What a hand write to one asset answers: the path the file stands at after
 * it, gone for a delete, and the frames it rewrote, each as a frame ref.
 */
export const assetWriteResultSchema = z.object({
  path: z.string(),
  frames: z.array(z.string()),
})

export type AssetWriteResult = z.infer<typeof assetWriteResultSchema>

/** The frames linking one asset, each as a frame ref in board order. */
export const assetFramesSchema = z.object({
  path: z.string(),
  frames: z.array(z.string()),
})

export type AssetFrames = z.infer<typeof assetFramesSchema>

/**
 * A project's own transitions as present mode plays them, sorted by name.
 * `css` holds each one's keyframes alone, under the names
 * `ownKeyframesName` gives them, and a file the board refuses is absent.
 */
export const transitionKeyframesListSchema = z.object({
  transitions: z.array(z.object({ name: z.string(), css: z.string() })),
})

export type TransitionKeyframesList = z.infer<
  typeof transitionKeyframesListSchema
>
