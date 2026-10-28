import type { AssetList } from '@/shared/records/assets'

/** A project's `assets/` files from the board server, null when the read is refused. */
export async function fetchAssets(project: string): Promise<AssetList | null> {
  const response = await fetch(
    `/api/projects/${encodeURIComponent(project)}/assets`,
  )
  const body = (await response.json()) as AssetsBody
  return body.ok ? body.data : null
}

type AssetsBody = { ok: true; data: AssetList } | { ok: false }
