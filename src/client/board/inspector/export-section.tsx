import { cn } from 'cn'
import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { useStore } from 'zustand'

import { Button } from '@/client/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/client/components/ui/dropdown-menu'
import type { FrameRecord } from '@/shared/records/list'
import { type Theme, THEMES } from '@/shared/theme'

import { ChromeMenuContent, MENU_ROW } from '../chrome/menu'
import { reportRefusal } from '../left-panel/page-actions'
import { COLOR_ROW } from './element/values'
import {
  type ExportScale,
  exportStore,
  SCALES,
  THEME_OPTIONS,
} from './export-store'

/** The file a download saves as, the form `capture` names a scaled image. */
function fileName(frame: string, theme: Theme, scale: ExportScale): string {
  return `${frame}.${theme}@${scale}x.png`
}

/**
 * One frame's PNG export at a scale, in one theme or both. Every theme
 * renders through the board's PNG route before any file downloads, so a
 * refusal on one leaves nothing half saved. It writes nothing to the board,
 * so a view-only tab exports too.
 */
export function ExportSection({ frame }: { frame: FrameRecord }) {
  const scale = useStore(exportStore, (state) => state.scale)
  const theme = useStore(exportStore, (state) => state.theme)
  const [exporting, setExporting] = useState(false)
  const themes = theme === 'both' ? THEMES : [theme]
  const files = themes.map((one) => fileName(frame.name, one, scale))

  const run = () => {
    setExporting(true)
    void exportFrame(frame.ref, themes, scale)
      .then(
        (blobs) => {
          blobs.forEach((blob, index) => download(blob, files[index] ?? ''))
        },
        reportRefusal(`Couldn't export ${frame.name}`),
      )
      .finally(() => setExporting(false))
  }

  return (
    <section
      aria-labelledby="inspector-export"
      className="border-b border-sidebar-border px-3 pt-2.5 pb-3"
    >
      <h2 id="inspector-export" className="mb-2 text-xs font-semibold">
        Export
      </h2>
      <div className="mb-2 grid grid-cols-[70px_1fr] gap-1.5">
        <ExportMenu
          label="Export scale"
          shown={`${scale}x`}
          value={String(scale)}
          options={SCALES.map((one) => ({
            value: String(one),
            label: `${one}x`,
          }))}
          onPick={(value) => {
            const picked = SCALES.find((one) => String(one) === value)
            if (picked) exportStore.setState({ scale: picked })
          }}
        />
        <ExportMenu
          label="Export theme"
          shown={
            THEME_OPTIONS.find((option) => option.value === theme)?.label ?? ''
          }
          value={theme}
          options={THEME_OPTIONS}
          onPick={(value) => {
            const picked = THEME_OPTIONS.find(
              (option) => option.value === value,
            )
            if (picked) exportStore.setState({ theme: picked.value })
          }}
        />
      </div>
      <Button
        variant="outline"
        size="sm"
        disabled={exporting}
        onClick={run}
        className="w-full bg-transparent text-xs dark:bg-transparent"
      >
        {exporting ? 'Exporting' : `Export ${frame.name}`}
      </Button>
      <p className="mt-1.5 text-label font-normal text-muted-foreground">
        PNG, {files.join(' and ')}
      </p>
    </section>
  )
}

interface ExportMenuProps {
  label: string
  shown: string
  value: string
  options: readonly { value: string; label: string }[]
  onPick: (value: string) => void
}

function ExportMenu({ label, shown, value, options, onPick }: ExportMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={label}
        className={cn(
          COLOR_ROW,
          'min-w-0 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
        )}
      >
        <span className="flex-1 truncate">{shown}</span>
        <ChevronDown
          aria-hidden
          className="size-2.5 shrink-0 text-muted-foreground"
        />
      </DropdownMenuTrigger>
      <ChromeMenuContent
        align="start"
        sideOffset={6}
        className="w-auto min-w-(--anchor-width)"
      >
        <DropdownMenuRadioGroup value={value} onValueChange={onPick}>
          {options.map((option) => (
            <DropdownMenuRadioItem
              key={option.value}
              value={option.value}
              closeOnClick
              className={cn(MENU_ROW, 'pr-8')}
            >
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </ChromeMenuContent>
    </DropdownMenu>
  )
}

/** Renders every theme in turn, refusing with the route's own message on the first that fails. */
async function exportFrame(
  ref: string,
  themes: readonly Theme[],
  scale: ExportScale,
): Promise<Blob[]> {
  const blobs: Blob[] = []
  // In turn, since the route renders one at a time whatever is asked of it.
  for (const theme of themes) {
    const query = new URLSearchParams({ ref, theme, scale: String(scale) })
    const response = await fetch(`/api/frames/png?${query}`)
    if (!response.ok) throw new Error(await refusalOf(response))
    blobs.push(await response.blob())
  }
  return blobs
}

async function refusalOf(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => null)
  if (
    typeof body === 'object' &&
    body !== null &&
    'error' in body &&
    typeof body.error === 'object' &&
    body.error !== null &&
    'message' in body.error &&
    typeof body.error.message === 'string'
  ) {
    return body.error.message
  }
  return `The board answered ${response.status}.`
}

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  // The click has already handed the blob to the download, so the URL can go.
  URL.revokeObjectURL(url)
}
