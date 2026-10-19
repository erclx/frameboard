import { Copy, FilePlus, PencilLine, Trash2 } from 'lucide-react'
import { useEffect } from 'react'
import { useLocation } from 'wouter'
import { useStore } from 'zustand'
import { createStore } from 'zustand/vanilla'

import {
  type Action,
  refreshActions,
  registerActions,
} from '@/client/actions/registry'
import { toast } from '@/client/components/ui/toast'
import { liveStore } from '@/client/live/store'
import { type Structure, structure } from '@/client/live/structure'
import { boardUrl } from '@/shared/board-urls'
import { namesCollide } from '@/shared/names'
import type { PageRecord } from '@/shared/records/list'

/** The page whose name the pages list shows as a rename field, by ref. */
const renamingStore = createStore<{ ref: string | null }>()(() => ({
  ref: null,
}))

export function useRenamingPage(): string | null {
  return useStore(renamingStore, (state) => state.ref)
}

export function startRename(ref: string): void {
  renamingStore.setState({ ref })
}

export function stopRename(): void {
  renamingStore.setState({ ref: null })
}

/** Shows a refused structure write, which writes nothing, as an error toast. */
export function reportRefusal(title: string) {
  return (error: unknown) => {
    toast.add({
      title,
      description: error instanceof Error ? error.message : String(error),
      type: 'error',
    })
  }
}

/** The first `page-<n>` no page holds, counting on from the pages there are. */
export function newPageName(taken: readonly string[]): string {
  for (let n = taken.length + 1; ; n++) {
    const name = `page-${n}`
    if (!taken.some((page) => namesCollide(page, name))) return name
  }
}

/** What a page write reads beside the page: the page on the canvas, the router, and the server. */
export interface PageWriteContext {
  /** The name of the page on the canvas. */
  current: string
  navigate: (to: string) => void
  calls?: Structure
}

/**
 * Renames a page through the server, following it when it is the page on
 * the canvas, so the board never lands on the old name.
 */
export async function renamePage(
  page: PageRecord,
  name: string,
  { current, navigate, calls = structure }: PageWriteContext,
): Promise<void> {
  try {
    const renamed = await calls.renamePage(page.ref, name)
    if (page.name === current) navigate(boardUrl(page.project, renamed.name))
  } catch (error) {
    reportRefusal(`Couldn't rename ${page.name}`)(error)
  }
}

/**
 * Deletes a page through the server. When it was the page on the canvas,
 * the board moves to the page that took its place, or the one before it.
 */
export async function deletePage(
  page: PageRecord,
  pages: readonly PageRecord[],
  { current, navigate, calls = structure }: PageWriteContext,
): Promise<void> {
  const others = pages.filter((candidate) => candidate.ref !== page.ref)
  const beside = others[page.index] ?? others[page.index - 1]
  try {
    await calls.deletePage(page.ref)
  } catch (error) {
    reportRefusal(`Couldn't delete ${page.name}`)(error)
    return
  }
  if (page.name !== current) return
  navigate(
    beside
      ? boardUrl(page.project, beside.name)
      : `/p/${encodeURIComponent(page.project)}`,
  )
}

/**
 * Registers `page.new`, `page.duplicate`, `page.rename`, and `page.delete`
 * for the page on the canvas while a board is mounted. Each is lit while the
 * tab may write, and a new or copied page opens on the canvas, a new one
 * with its name ready to type over.
 */
export function usePageActions(
  project: string,
  page: string | undefined,
): void {
  const [, navigate] = useLocation()
  useEffect(() => {
    const pages = () =>
      liveStore
        .getState()
        .board?.projects.find((candidate) => candidate.name === project)
        ?.pages ?? []
    const current = () => pages().find((candidate) => candidate.name === page)
    const writable = () => liveStore.getState().canWrite
    const onPage = () => writable() && current() !== undefined
    const open = (record: PageRecord) =>
      navigate(boardUrl(record.project, record.name))

    const actions: Action[] = [
      {
        id: 'page.new',
        label: 'Add page',
        group: 'page',
        command: { label: 'Add page', icon: FilePlus },
        enabled: writable,
        run: () => {
          const names = pages().map((candidate) => candidate.name)
          const at = current()
          structure
            .addPage(
              `${project}/${newPageName(names)}`,
              at ? at.index + 1 : undefined,
            )
            .then((added) => {
              open(added)
              startRename(added.ref)
            }, reportRefusal("Couldn't add a page"))
        },
      },
      {
        id: 'page.duplicate',
        label: 'Duplicate page',
        group: 'page',
        command: { label: 'Duplicate page', icon: Copy },
        enabled: onPage,
        run: () => {
          const at = current()
          if (!at) return
          structure
            .duplicatePage(at.ref)
            .then(open, reportRefusal(`Couldn't duplicate ${at.name}`))
        },
      },
      {
        id: 'page.rename',
        label: 'Rename page',
        group: 'page',
        command: { label: 'Rename page', icon: PencilLine },
        enabled: onPage,
        run: () => {
          const at = current()
          if (at) startRename(at.ref)
        },
      },
      {
        id: 'page.delete',
        label: 'Delete page',
        group: 'page',
        command: { label: 'Delete page', icon: Trash2 },
        enabled: onPage,
        run: () => {
          const at = current()
          if (at) void deletePage(at, pages(), { current: at.name, navigate })
        },
      },
    ]
    const unregister = registerActions(actions)
    const unsubscribe = liveStore.subscribe((state, previous) => {
      if (
        state.canWrite !== previous.canWrite ||
        state.board !== previous.board
      )
        refreshActions()
    })
    return () => {
      unsubscribe()
      unregister()
    }
  }, [project, page, navigate])
}
