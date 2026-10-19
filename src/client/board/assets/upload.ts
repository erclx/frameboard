import { writeBoard } from '@/client/live/write'
import type { AssetAddResult } from '@/shared/records/assets'

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
