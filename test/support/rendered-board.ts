import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { scanBoard } from '@/server/board/scan'
import { startFrameHost } from '@/server/capture/host'
import type { RenderedTarget } from '@/server/checks/browser/layout'
import { boardPath } from '@/server/checks/frame-source'

export interface RenderedBoard {
  /** The origin serving the board's frames. */
  url: string
  /** A frame of the board as a browser rule reads it, by ref. */
  target: (ref: string) => RenderedTarget
  close: () => Promise<void>
}

/** Serves a board's frames on a frame host, for a spec reading them rendered. */
export async function serveRendered(root: string): Promise<RenderedBoard> {
  const faces = mkdtempSync(join(tmpdir(), 'frameboard-faces-'))
  const [host, board] = await Promise.all([
    startFrameHost({ root, facesDir: faces }),
    scanBoard(root),
  ])
  const frames = board.projects.flatMap((project) =>
    project.pages.flatMap((page) => page.frames),
  )
  return {
    url: host.url,
    target: (ref) => {
      const frame = frames.find((each) => each.ref === ref)
      if (!frame) throw new Error(`No frame ${ref} on the board.`)
      return {
        ref,
        path: boardPath(root, frame.path),
        box: { width: frame.box.width, height: frame.box.height },
      }
    },
    close: async () => {
      await host.close()
      rmSync(faces, { recursive: true, force: true })
    },
  }
}
