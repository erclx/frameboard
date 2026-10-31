import { cn } from 'cn'
import { useEffect, useRef, useState } from 'react'

interface RenameFieldProps {
  /** The name the field opens with, selected whole. */
  name: string
  /** Names what is being renamed, such as `Rename page home`. */
  label: string
  /** Called once with the trimmed name on Enter or blur, unless it is unchanged, or empty without `clearable`. */
  onCommit: (name: string) => void
  /** Called on Esc, and after a commit that changed nothing. */
  onCancel: () => void
  /** Sizes the field to its name as it is typed, stopping at the host's width, where it fills the host otherwise. */
  hug?: boolean
  /** Commits an emptied name as `''` rather than cancelling, for a name that has a fallback. */
  clearable?: boolean
}

/**
 * The inline rename box of `canon/design/layers/edit`, standing in for a
 * row's name. Enter or a blur commits and Esc cancels, and keys typed into it
 * never reach the board's shortcuts, so Cmd+Z undoes the typing.
 *
 * A hugging field takes its width from a hidden copy of the value sharing its
 * grid cell, since `field-sizing: content` is missing in Firefox.
 */
export function RenameField({
  name,
  label,
  onCommit,
  onCancel,
  hug = false,
  clearable = false,
}: RenameFieldProps) {
  const input = useRef<HTMLInputElement>(null)
  const done = useRef(false)
  const [value, setValue] = useState(name)

  useEffect(() => {
    input.current?.focus()
    input.current?.select()
  }, [])

  const finish = (commit: boolean) => {
    if (done.current) return
    done.current = true
    const next = input.current?.value.trim() ?? ''
    if (commit && (clearable || next !== '') && next !== name) onCommit(next)
    else onCancel()
  }

  const field = (
    <input
      ref={input}
      aria-label={label}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      // One character, so the input's own default width never props the hug open.
      size={hug ? 1 : undefined}
      spellCheck={false}
      // A double-click opened the field, so a click inside it stays in it.
      onClick={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (event.key === 'Enter') finish(true)
        else if (event.key === 'Escape') finish(false)
        else return
        event.preventDefault()
        event.stopPropagation()
      }}
      onBlur={() => finish(true)}
      className={cn(
        'h-[22px] min-w-0 rounded-[5px] bg-background px-1.5 text-foreground ring-[1.5px] ring-primary outline-none selection:bg-primary/45',
        hug ? 'col-start-1 row-start-1 w-full' : '-ml-1.5 flex-1',
      )}
    />
  )
  if (!hug) return field
  return (
    // The cap gives back the -ml-1.5, so a long name stops where a filling field ends.
    <span className="-ml-1.5 inline-grid max-w-[calc(100%+0.375rem)] min-w-0 grid-cols-[minmax(0,auto)]">
      {/* The trailing space keeps room for the caret past the last character. */}
      <span
        aria-hidden
        className="invisible col-start-1 row-start-1 h-0 px-1.5 whitespace-pre"
      >
        {`${value} `}
      </span>
      {field}
    </span>
  )
}
