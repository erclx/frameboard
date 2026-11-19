import { writeBoard } from '@/client/live/write'
import type {
  AssetAddResult,
  AssetFrames,
  AssetWriteResult,
} from '@/shared/records/assets'

/** Posts the files to the project's `assets/` through the board's one write path. */
export function uploadAssets(
  project: string,
  files: File[],
): Promise<AssetAddResult> {
  const form = new FormData()
  for (const file of files) form.append('files', file)
  return writeBoard<AssetAddResult>(
    `/api/projects/${encodeURIComponent(project)}/assets`,
    form,
  )
}

/** The board's API address of one asset, each path segment encoded. */
function assetApiUrl(project: string, path: string): string {
  const segments = path.split('/').map(encodeURIComponent).join('/')
  return `/api/projects/${encodeURIComponent(project)}/assets/${segments}`
}

/** Gives an asset a new name in its folder, pointing every frame linking it at that name. */
export function renameAsset(
  project: string,
  path: string,
  name: string,
): Promise<AssetWriteResult> {
  return writeBoard<AssetWriteResult>(
    assetApiUrl(project, path),
    { name },
    'PATCH',
  )
}

/** Writes a picked file's bytes in place of an asset's, keeping its path. */
export function replaceAsset(
  project: string,
  path: string,
  file: File,
): Promise<AssetWriteResult> {
  const form = new FormData()
  form.append('file', file)
  return writeBoard<AssetWriteResult>(assetApiUrl(project, path), form, 'PUT')
}

export function deleteAsset(
  project: string,
  path: string,
): Promise<AssetWriteResult> {
  return writeBoard<AssetWriteResult>(assetApiUrl(project, path), {}, 'DELETE')
}

/** The refs of the frames linking an asset, read as they stand now. */
export async function fetchAssetFrames(
  project: string,
  path: string,
): Promise<string[]> {
  const response = await fetch(assetApiUrl(project, path))
  const body = (await response.json()) as
    | { ok: true; data: AssetFrames }
    | { ok: false; error: { message: string } }
  if (!body.ok) throw new Error(body.error.message)
  return body.data.frames
}

/** The asset writes the Files view makes, the API in the app. */
export interface AssetWrites {
  rename: typeof renameAsset
  replace: typeof replaceAsset
  remove: typeof deleteAsset
  frames: typeof fetchAssetFrames
}

export const ASSET_WRITES: AssetWrites = {
  rename: renameAsset,
  replace: replaceAsset,
  remove: deleteAsset,
  frames: fetchAssetFrames,
}
