import { cn } from 'cn'
import { ChevronDown } from 'lucide-react'
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useLocation } from 'wouter'
import { useStore } from 'zustand'

import { SWATCH_RING } from '@/client/board/inspector/element/values'
import { reportRefusal } from '@/client/board/left-panel/page-actions'
import { choosePreset, placeFrame } from '@/client/board/structure/tool'
import { useTokenTable } from '@/client/board/tokens'
import { canvasView } from '@/client/board/view'
import { toast } from '@/client/components/ui/toast'
import { movePin } from '@/client/home/pins'
import { useLive } from '@/client/live/store'
import { type Structure, structure } from '@/client/live/structure'
import { BoardWriteError } from '@/client/live/write'
import { boardUrl } from '@/shared/board-urls'
import { FRAME_SIZES, type FrameSizePreset } from '@/shared/frame-sizes'
import type { PageRecord } from '@/shared/records/list'
import type { TokenTable } from '@/shared/records/tokens'
import {
  STARTER_ACCENTS,
  STARTER_FONTS,
  type StarterAccent,
  type StarterFont,
} from '@/shared/starter-tokens'

import {
  agentFolder,
  agentPrompt,
  type Drawer,
  folderName,
  type GuideState,
  guideStore,
} from './state'

type Step = 'name' | 'size' | 'look' | 'agent'

const SIZE_LABELS: Record<FrameSizePreset, string> = {
  phone: 'Phone',
  tablet: 'Tablet',
  desktop: 'Desktop',
}

/** The outline each size option draws, scaled from its preset. */
const SIZE_SHAPES: Record<FrameSizePreset, string> = {
  phone: 'h-9 w-5',
  tablet: 'h-[38px] w-[30px]',
  desktop: 'h-[30px] w-[46px]',
}

const ACCENT_LABELS: Record<StarterAccent, string> = {
  blue: 'Blue',
  red: 'Red',
  green: 'Green',
  orange: 'Orange',
  purple: 'Purple',
}

/**
 * The card a new board's empty page shows in place of its note, asking for
 * the project's name, the first frame's size, a starting look, and who draws
 * the first frame. Each answer goes through a write the board already makes,
 * so Undo takes it back, and the look step drops out where a token sheet
 * already reaches the project.
 */
export function GuideCard({
  page,
  calls = structure,
  loadTokens,
}: {
  page: PageRecord
  calls?: Structure
  /** Reads the project's token table, the server's when absent. */
  loadTokens?: (project: string) => Promise<TokenTable | null>
}) {
  const state = useStore(guideStore)
  const table = useTokenTable(page.project, loadTokens)
  const root = useLive((live) => live.board?.root ?? '')
  const [, navigate] = useLocation()
  const heading = useRef<HTMLHeadingElement>(null)

  const project = state.project ?? page.project
  const withLook =
    state.withLook ??
    (table === undefined || table === null || table.sheets.length === 0)
  const steps: Step[] = withLook
    ? ['name', 'size', 'look', 'agent']
    : ['name', 'size', 'agent']
  const at = Math.min(state.at, steps.length - 1)
  const step = steps[at] ?? 'name'
  const name = state.name ?? project
  const folder = folderName(name)

  useEffect(() => {
    if (!state.moved) return
    heading.current?.focus()
    guideStore.setState({ moved: false })
  }, [state.moved])

  const set = (patch: Partial<GuideState>) => guideStore.setState(patch)
  const open = () => set({ phase: 'open', project, withLook, refusal: null })
  const advance = () =>
    set({ at: at + 1, refusal: null, busy: false, moved: true })

  const refuse = (error: unknown, title: string) => {
    if (error instanceof BoardWriteError) {
      set({ refusal: error.message, busy: false })
    } else {
      set({ busy: false })
      reportRefusal(title)(error)
    }
  }

  const finish = async () => {
    if (withLook) {
      try {
        await calls.projectTokens(project, {
          accent: state.accent,
          font: state.font,
        })
      } catch (error) {
        // A sheet that reached the project meanwhile already gives it a look.
        if (
          !(error instanceof BoardWriteError && error.code === 'tokens-exist')
        ) {
          // The last step draws no refusal line, so the toast carries it.
          set({ busy: false })
          return reportRefusal(`Couldn't write ${project}/tokens.css`)(error)
        }
      }
    }
    if (state.drawer === 'self') {
      choosePreset(state.size)
      const added = await placeFrame(
        { x: 0, y: 0 },
        { page: page.ref, frames: page.frames, calls },
      )
      // An empty page opens at 100%, which clips a desktop frame.
      if (added) canvasView.fitTo([added.box])
    }
    set({ phase: 'done', busy: false })
    toast.add({
      title: 'Board set up',
      description:
        state.drawer === 'self'
          ? `Added a ${state.size} frame to ${page.name}.`
          : `Paste the prompt into Claude Code to draw the first frame of ${project}.`,
      type: 'success',
    })
  }

  const next = async () => {
    if (state.busy) return
    open()
    set({ busy: true })
    if (step === 'name') {
      if (folder === '') {
        return set({ refusal: 'Enter a name for the project.', busy: false })
      }
      if (folder === project) return advance()
      try {
        await calls.renameProject(project, folder)
      } catch (error) {
        return refuse(error, `Couldn't rename ${project}`)
      }
      movePin(project, folder)
      set({ project: folder, name: null })
      navigate(boardUrl(folder, page.name), { replace: true })
      return advance()
    }
    if (step === 'agent') return finish()
    advance()
  }

  return (
    <section
      aria-labelledby="guide-title"
      className="pointer-events-auto absolute top-1/2 left-1/2 w-110 max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-[52%] overflow-hidden rounded-[14px] border border-border bg-card text-body text-card-foreground shadow-[0_16px_48px_rgba(0,0,0,.16),0_1px_3px_rgba(0,0,0,.08)]"
    >
      <div className="flex items-center gap-2 px-4 pt-3.5">
        <h2 id="guide-title" className="text-sm font-semibold">
          Set up your board
        </h2>
        <span className="ml-auto text-muted-foreground tabular-nums">
          {at + 1} of {steps.length}
        </span>
      </div>
      <div aria-hidden className="flex gap-1 px-4 pt-2.5">
        {steps.map((each, index) => (
          <i
            key={each}
            className={cn(
              'h-[3px] flex-1 rounded-sm',
              index <= at ? 'bg-primary' : 'bg-muted',
            )}
          />
        ))}
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void next()
        }}
      >
        <div className="p-4">
          <h3
            ref={heading}
            id="guide-step"
            tabIndex={-1}
            className="mb-1 text-base font-semibold outline-none"
          >
            {HEADINGS[step]}
          </h3>
          {step === 'name' ? (
            <NameStep
              name={name}
              project={project}
              folder={folder}
              refusal={state.refusal}
              onChange={(typed) => set({ name: typed, refusal: null })}
            />
          ) : step === 'size' ? (
            <SizeStep
              size={state.size}
              page={page.name}
              onChange={(size) => set({ size })}
            />
          ) : step === 'look' ? (
            <LookStep
              accent={state.accent}
              font={state.font}
              project={project}
              refusal={state.refusal}
              onChange={(look) => set(look)}
            />
          ) : (
            <AgentStep
              drawer={state.drawer}
              folder={agentFolder(root)}
              sheet={withLook ? `${project}/tokens.css` : null}
              prompt={agentPrompt(state.size, project)}
              size={state.size}
              page={page.name}
              onChange={(drawer) => set({ drawer })}
            />
          )}
        </div>
        <div className="flex items-center gap-2 border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={() => set({ phase: 'done' })}
            className="h-[30px] rounded-lg px-1 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            Skip setup
          </button>
          {at > 0 ? (
            <button
              type="button"
              onClick={() => set({ at: at - 1, refusal: null, moved: true })}
              className="ml-auto h-[30px] rounded-lg bg-muted px-3 font-medium outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              Back
            </button>
          ) : null}
          <button
            type="submit"
            aria-disabled={state.busy}
            className={cn(
              'h-[30px] rounded-lg bg-primary px-3 font-medium text-primary-foreground outline-none hover:bg-primary/85 focus-visible:ring-3 focus-visible:ring-ring/50 aria-disabled:opacity-60',
              at === 0 && 'ml-auto',
            )}
          >
            {step === 'agent' ? 'Finish' : 'Next'}
          </button>
        </div>
      </form>
    </section>
  )
}

const HEADINGS: Record<Step, string> = {
  name: 'What are you designing?',
  size: 'Which screen first?',
  look: 'Pick a starting look',
  agent: 'Who draws the first frame?',
}

function Lead({ children }: { children: ReactNode }) {
  return <p className="leading-[1.55] text-muted-foreground">{children}</p>
}

function Writes({ children }: { children: ReactNode }) {
  return (
    <p className="mt-2.5 flex flex-wrap items-center gap-1.5 text-label font-normal text-muted-foreground">
      {children}
    </p>
  )
}

function Path({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <code
      className={cn(
        'rounded bg-muted px-[5px] py-px font-mono text-[10.5px]',
        className,
      )}
    >
      {children}
    </code>
  )
}

function Refusal({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p
      id={id}
      role="alert"
      className="mt-1.5 text-label leading-[1.45] font-normal text-destructive"
    >
      {children}
    </p>
  )
}

function NameStep({
  name,
  project,
  folder,
  refusal,
  onChange,
}: {
  name: string
  project: string
  folder: string
  refusal: string | null
  onChange: (typed: string) => void
}) {
  return (
    <>
      <Lead>
        Give the project a name. You can rename it any time from the header.
      </Lead>
      <input
        autoFocus
        aria-labelledby="guide-step"
        aria-invalid={refusal !== null}
        aria-describedby={refusal ? 'guide-refusal' : undefined}
        value={name}
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
        className="mt-3 h-[34px] w-full rounded-lg bg-background px-2.5 text-[13px] text-foreground ring-[1.5px] ring-primary outline-none selection:bg-primary/45 aria-invalid:ring-destructive"
      />
      {refusal ? <Refusal id="guide-refusal">{refusal}</Refusal> : null}
      <Writes>
        {folder === project || folder === '' ? (
          <>
            Keeps <Path>{project}/</Path>
          </>
        ) : (
          <>
            Renames <Path>{project}/</Path> to <Path>{folder}/</Path>
          </>
        )}
      </Writes>
    </>
  )
}

/** A native radio dressed as a card, so arrow keys move through its group. */
function Choice({
  group,
  checked,
  onSelect,
  className,
  children,
  label,
  labelledBy,
  disabled = false,
}: {
  group: string
  checked: boolean
  onSelect: () => void
  className: string
  children: ReactNode
  label?: string
  /** Names the radio from these ids, so a control inside the card stays out of its name. */
  labelledBy?: string
  disabled?: boolean
}) {
  return (
    <label
      className={cn(
        'relative has-checked:border-primary has-checked:shadow-[0_0_0_1px_var(--primary)] has-[input:focus-visible]:ring-3 has-[input:focus-visible]:ring-ring/50 has-disabled:opacity-60',
        className,
      )}
    >
      <input
        type="radio"
        name={group}
        checked={checked}
        onChange={onSelect}
        disabled={disabled}
        aria-label={label}
        aria-labelledby={labelledBy}
        className="peer sr-only"
      />
      {children}
    </label>
  )
}

function SizeStep({
  size,
  page,
  onChange,
}: {
  size: FrameSizePreset
  page: string
  onChange: (size: FrameSizePreset) => void
}) {
  const presets = Object.keys(FRAME_SIZES) as FrameSizePreset[]
  return (
    <>
      <Lead>
        Sets the size of your first frame. Add other sizes later from the Frame
        tool.
      </Lead>
      <div
        role="radiogroup"
        aria-labelledby="guide-step"
        className="mt-3 grid grid-cols-3 gap-2"
      >
        {presets.map((preset) => (
          <Choice
            key={preset}
            group="guide-size"
            checked={size === preset}
            onSelect={() => onChange(preset)}
            className="flex flex-col items-center gap-2 rounded-[10px] border border-border px-2 pt-3.5 pb-2.5 text-muted-foreground has-checked:text-primary"
          >
            <span
              aria-hidden
              className={cn(
                'rounded border-[1.5px] border-current',
                SIZE_SHAPES[preset],
              )}
            />
            <b className="font-semibold text-foreground">
              {SIZE_LABELS[preset]}
            </b>
            {FRAME_SIZES[preset].width} × {FRAME_SIZES[preset].height}
          </Choice>
        ))}
      </div>
      <Writes>
        Sizes the first frame on <Path>{page}</Path>
      </Writes>
    </>
  )
}

function LookStep({
  accent,
  font,
  project,
  refusal,
  onChange,
}: {
  accent: StarterAccent
  font: StarterFont
  project: string
  refusal: string | null
  onChange: (look: { accent: StarterAccent; font: StarterFont }) => void
}) {
  const accents = Object.keys(STARTER_ACCENTS) as StarterAccent[]
  const fonts = Object.keys(STARTER_FONTS) as StarterFont[]
  return (
    <>
      <Lead>
        Every frame in this project reads these tokens, in light and dark. The
        Theme tab shows them.
      </Lead>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-muted px-2.5 py-2">
          <span
            id="guide-accent"
            className="mb-1.5 block text-label font-normal text-muted-foreground"
          >
            Accent
          </span>
          <div
            role="radiogroup"
            aria-labelledby="guide-accent"
            className="flex gap-1.5"
          >
            {accents.map((each) => (
              <Choice
                key={each}
                group="guide-accent"
                label={ACCENT_LABELS[each]}
                checked={accent === each}
                onSelect={() => onChange({ accent: each, font })}
                className="size-5 overflow-hidden rounded-[5px] has-checked:shadow-[0_0_0_2px_var(--muted),0_0_0_3.5px_var(--foreground)]"
              >
                <span
                  aria-hidden
                  className={cn(
                    'absolute inset-0 rounded-[5px] bg-(--swatch) dark:bg-(--swatch-dark)',
                    SWATCH_RING,
                  )}
                  style={
                    {
                      '--swatch': STARTER_ACCENTS[each].light,
                      '--swatch-dark': STARTER_ACCENTS[each].dark,
                    } as CSSProperties
                  }
                />
              </Choice>
            ))}
          </div>
        </div>
        <label className="rounded-lg bg-muted px-2.5 py-2">
          <span className="mb-1.5 block text-label font-normal text-muted-foreground">
            Font
          </span>
          <span className="relative block">
            <select
              value={font}
              onChange={(event) =>
                onChange({ accent, font: event.target.value as StarterFont })
              }
              className="h-[26px] w-full appearance-none rounded-md bg-card px-2 text-foreground shadow-[0_0_0_1px_var(--border)] outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
            >
              {fonts.map((each) => (
                <option key={each} value={each}>
                  {STARTER_FONTS[each].family}
                </option>
              ))}
            </select>
            <ChevronDown
              aria-hidden
              className="pointer-events-none absolute top-1/2 right-2 size-2.5 -translate-y-1/2"
            />
          </span>
        </label>
      </div>
      {refusal ? <Refusal id="guide-refusal">{refusal}</Refusal> : null}
      <Writes>
        Finish writes <Path>{project}/tokens.css</Path>
      </Writes>
    </>
  )
}

function AgentStep({
  drawer,
  folder,
  sheet,
  prompt,
  size,
  page,
  onChange,
}: {
  drawer: Drawer
  /** Where Claude Code opens to find this board. */
  folder: string
  /** The token sheet Finish writes first, null where the look step dropped out. */
  sheet: string | null
  prompt: string
  size: FrameSizePreset
  page: string
  onChange: (drawer: Drawer) => void
}) {
  const [copied, setCopied] = useState<string | null>(null)
  const option =
    'flex gap-2.5 rounded-[10px] border border-border px-3 py-2.5 text-left'
  const dot =
    'mt-px size-3.5 flex-none rounded-full border-[1.5px] border-faint peer-checked:border-4 peer-checked:border-primary'
  return (
    <>
      <Lead>
        Frameboard is drawn on by a coding agent. You can also start from a
        blank frame.
      </Lead>
      <div
        role="radiogroup"
        aria-labelledby="guide-step"
        className="mt-3 flex flex-col gap-2"
      >
        <Choice
          group="guide-drawer"
          checked={drawer === 'agent'}
          onSelect={() => onChange('agent')}
          labelledBy="guide-agent-name guide-agent-hint"
          className={option}
        >
          <span aria-hidden className={dot} />
          <span className="min-w-0 flex-1">
            <b id="guide-agent-name" className="mb-0.5 block font-semibold">
              My agent
            </b>
            <span
              id="guide-agent-hint"
              className="leading-[1.45] text-muted-foreground"
            >
              Paste this into Claude Code opened in{' '}
              <Path className="inline-block max-w-full wrap-anywhere">
                {folder}
              </Path>
            </span>
            {drawer === 'agent' ? (
              <span className="mt-2.5 flex items-center gap-2 rounded-lg bg-muted py-2 pr-2 pl-2.5">
                <code className="min-w-0 flex-1 font-mono text-[11.5px] text-foreground">
                  {prompt}
                </code>
                <button
                  type="button"
                  onClick={() =>
                    void navigator.clipboard
                      .writeText(prompt)
                      .then(
                        () => setCopied(prompt),
                        reportRefusal("Couldn't copy the prompt"),
                      )
                  }
                  className="h-6 rounded-md px-1.5 text-label font-normal text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {copied === prompt ? 'Copied' : 'Copy'}
                </button>
              </span>
            ) : null}
          </span>
        </Choice>
        <Choice
          group="guide-drawer"
          checked={drawer === 'self'}
          onSelect={() => onChange('self')}
          className={option}
        >
          <span aria-hidden className={dot} />
          <span className="min-w-0 flex-1">
            <b className="mb-0.5 block font-semibold">I’ll start myself</b>
            <span className="leading-[1.45] text-muted-foreground">
              Adds an empty {size} frame to {page}.
            </span>
          </span>
        </Choice>
      </div>
      <Writes>
        {sheet === null ? (
          drawer === 'agent' ? (
            'Writes nothing until your agent draws'
          ) : (
            'Writes one frame file'
          )
        ) : drawer === 'agent' ? (
          <>
            Finish writes only <Path>{sheet}</Path>
          </>
        ) : (
          <>
            Finish writes <Path>{sheet}</Path> and one frame file
          </>
        )}
      </Writes>
    </>
  )
}
