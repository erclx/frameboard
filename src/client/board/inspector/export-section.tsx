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

import { ChromeMenuContent, MENU_ROW } from '../chrome/menu'
import { reportRefusal } from '../left-panel/page-actions'
import { COLOR_ROW } from './element/values'
import {
  exportFileNames,
  exportFrame,
  exportStore,
  SCALES,
  THEME_OPTIONS,
} from './export-store'

/** One frame's PNG export, picking the scale and theme `exportFrame` renders at, in one theme or both. */
export function ExportSection({ frame }: { frame: FrameRecord }) {
  const scale = useStore(exportStore, (state) => state.scale)
  const theme = useStore(exportStore, (state) => state.theme)
  const [exporting, setExporting] = useState(false)
  const files = exportFileNames(frame.name, { scale, theme })

  const run = () => {
    setExporting(true)
    void exportFrame(frame, { scale, theme })
      .catch(reportRefusal(`Couldn't export ${frame.name}`))
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
      <p className="mt-1.5 text-caption text-muted-foreground">
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
