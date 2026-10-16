import { useEffect, useState } from 'react'

import type { ListResult } from '@/shared/records/list'

import { Canvas } from './board/canvas'

const NO_RELOADS = {}

export function App() {
  const [board, setBoard] = useState<ListResult | null>(null)

  useEffect(() => {
    void fetch('/api/board')
      .then((response) => response.json())
      .then((body: { data: ListResult }) => setBoard(body.data))
  }, [])

  const page = board?.projects[0]?.pages[0]
  return (
    <main className="h-svh bg-background text-foreground">
      {page ? <Canvas page={page} reloads={NO_RELOADS} /> : null}
    </main>
  )
}
