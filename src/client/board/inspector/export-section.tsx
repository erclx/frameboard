import { ChevronDown } from 'lucide-react'
import { useId, useState } from 'react'
import { useStore } from 'zustand'

import { Button } from '@/client/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/client/components/ui/dropdown-menu'
import { cn } from '@/client/lib/cn'
import type { FrameRecord } from '@/shared/records/list'

import { ChromeMenuContent, MENU_ROW } from '../chrome/menu'
import { reportRefusal } from '../left-panel/page-actions'
import { COLOR_ROW } from './element/values'
import {
  elementExportName,
  exportBaseName,
  type ExportElement,
  exportFileNames,
  exportFrame,
  exportStore,
  SCALES,
  THEME_OPTIONS,
} from './export-store'

interface ExportSectionProps {
  frame: FrameRecord
  /** The one selected element to export in the frame's place, under the name its Layers row shows. */
  element?: ExportElement & { name: string }
}

/**
 * One frame's PNG export, or one element's, picking the scale and theme
 * `exportFrame` renders at, in one theme or both, and for a frame holding a
 * device whether the PNG draws it. The Name field starts as the frame's
 * name, or `<frame>-<element>` for an element, and names every file once
 * typed over. It lives in the section, so the caller keys the section by
 * what is selected and a new selection starts from its own name.
 */
export function ExportSection({ frame, element }: ExportSectionProps) {
  const scale = useStore(exportStore, (state) => state.scale)
  const theme = useStore(exportStore, (state) => state.theme)
  const device = useStore(exportStore, (state) => state.device ?? false)
  const [exporting, setExporting] = useState(false)
  // Null until typed in, so an untouched field follows a rename.
  const [typed, setTyped] = useState<string | null>(null)
  const nameId = useId()
  const start = element
    ? elementExportName(frame.name, element.name)
    : frame.name
  const base = exportBaseName(typed ?? '', start)
  const suffixes = exportFileNames('', { scale, theme })
  const files = suffixes.map((suffix) => `${base}${suffix}`)

  const run = () => {
    setExporting(true)
    void exportFrame(frame, { scale, theme, device }, base, element)
      .catch(reportRefusal(`Couldn't export ${base}`))
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
      <label
        htmlFor={nameId}
        className="mb-[3px] block text-caption text-muted-foreground"
      >
        Name
      </label>
      <div
        className={cn(
          COLOR_ROW,
          'mb-2 focus-within:ring-2 focus-within:ring-ring/50',
        )}
      >
        <input
          id={nameId}
          value={typed ?? start}
          onChange={(event) => setTyped(event.target.value)}
          spellCheck={false}
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent outline-none"
        />
        <span className="shrink-0 font-mono text-caption text-muted-foreground">
          {suffixes[0]}
        </span>
      </div>
      {frame.device && !element ? (
        <IncludeDevice
          on={device}
          onChange={(on) => exportStore.setState({ device: on })}
        />
      ) : null}
      <Button
        variant="outline"
        size="sm"
        disabled={exporting}
        onClick={run}
        className="w-full bg-transparent text-xs dark:bg-transparent"
      >
        {exporting
          ? 'Exporting'
          : files.length === 1
            ? 'Export 1 file'
            : `Export ${files.length} files`}
      </Button>
      <ul
        aria-label="Exported files"
        className="mt-[7px] font-mono text-caption text-muted-foreground"
      >
        {files.map((file) => (
          <li key={file} title={file} className="truncate">
            {file}
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Whether the PNG draws the frame inside its device, carried across frames as the scale is. */
function IncludeDevice({
  on,
  onChange,
}: {
  on: boolean
  onChange: (on: boolean) => void
}) {
  return (
    <label className="mb-2 flex items-center justify-between gap-2 text-xs">
      <span>Include device</span>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onChange(!on)}
        className={cn(
          'relative h-3.5 w-[26px] shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
          on ? 'bg-primary' : 'bg-input',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'absolute top-0.5 size-2.5 rounded-full bg-white transition-[left] motion-reduce:transition-none',
            on ? 'left-[14px]' : 'left-0.5',
          )}
        />
      </button>
    </label>
  )
}

interface ExportMenuProps {
  label: string
  shown: string
  value: string
  options: readonly { value: string; label: string }[]
  onPick: (value: string) => void
}

/** One of the Export section's pickers, a row opening a menu of choices. */
export function ExportMenu({
  label,
  shown,
  value,
  options,
  onPick,
}: ExportMenuProps) {
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
