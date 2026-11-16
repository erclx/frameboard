import { useEffect, useState } from 'react'

import type { KitRecord } from '@/shared/kits'

interface KitsBody {
  ok: boolean
  data?: KitRecord[]
}

/** Every kit the board can install, undefined while loading and null when the list did not answer. */
export function useKits(
  load: () => Promise<KitRecord[] | null> = fetchKits,
): KitRecord[] | null | undefined {
  const [kits, setKits] = useState<KitRecord[] | null | undefined>()
  useEffect(() => {
    let current = true
    void load()
      .catch(() => null)
      .then((next) => {
        if (current) setKits(next)
      })
    return () => {
      current = false
    }
  }, [load])
  return kits
}

export async function fetchKits(): Promise<KitRecord[] | null> {
  const body = (await (await fetch('/api/kits')).json()) as KitsBody
  return body.ok ? (body.data ?? null) : null
}
