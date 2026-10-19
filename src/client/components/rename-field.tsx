import { useEffect, useRef } from 'react'

interface RenameFieldProps {
  /** The name the field opens with, selected whole. */
  name: string
  /** Names what is being renamed, such as `Rename page home`. */
  label: string
  /** Called once with the trimmed name on Enter or blur, unless it is empty or unchanged. */
  onCommit: (name: string) => void
  /** Called on Esc, and after a commit that changed nothing. */
  onCancel: () => void
}

/**
 * The inline rename box of `canon/design/layers/edit`, standing in for a
 * row's name. Enter or a blur commits and Esc cancels, and keys typed into it
 * never reach the board's shortcuts, so Cmd+Z undoes the typing.
 */
export function RenameField({
  name,
  label,
  onCommit,
  onCancel,
}: RenameFieldProps) {
  const input = useRef<HTMLInputElement>(null)
  const done = useRef(false)

  useEffect(() => {
    input.current?.select()
  }, [])

  const finish = (commit: boolean) => {
    if (done.current) return
    done.current = true
    const next = input.current?.value.trim() ?? ''
    if (commit && next !== '' && next !== name) onCommit(next)
    else onCancel()
  }

  return (
    <input
      ref={input}
      aria-label={label}
      defaultValue={name}
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
      className="-ml-1.5 h-[22px] min-w-0 flex-1 rounded-[5px] bg-background px-1.5 text-foreground ring-[1.5px] ring-primary outline-none selection:bg-primary/45"
    />
  )
}
