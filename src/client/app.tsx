import { useEffect } from 'react'

import { Canvas } from './board/canvas'
import { connectLive } from './live/socket'
import { liveStore, useLive } from './live/store'

export function App() {
  useEffect(() => connectLive(liveStore), [])
  const page = useLive((state) => state.board?.projects[0]?.pages[0])
  const reloads = useLive((state) => state.reloads)

  return (
    <main className="h-svh bg-background text-foreground">
      {page ? <Canvas page={page} reloads={reloads} /> : null}
    </main>
  )
}
