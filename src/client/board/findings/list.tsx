import { TriangleAlert } from 'lucide-react'
import { useRef, useState } from 'react'

import { Button } from '@/client/components/ui/button'
import { toast } from '@/client/components/ui/toast'
import { useLive } from '@/client/live/store'
import { type Structure, structure } from '@/client/live/structure'
import type { Finding } from '@/shared/records/check'

interface FindingsListProps {
  findings: readonly Finding[]
  /** The frame's project, which each card's button turns its rule off for. Absent draws no button. */
  project?: string
  /** The board's structure writes, `structure` outside a test. */
  calls?: Pick<Structure, 'setProjectRule'>
}

/**
 * A frame's findings, each as its rule, the file it sits in when that is not
 * the frame's own, the line when it has one, and its message, which already ends on the fix. The badge's popover draws
 * it, the warning glyph in the destructive hue for an error and the note hue
 * for a warning. Each card of a tab that may write ends on a button turning
 * its rule off for the project, which the server's recheck then takes out of
 * every frame's list.
 */
export function FindingsList({
  findings,
  project,
  calls = structure,
}: FindingsListProps) {
  const canWrite = useLive((state) => state.canWrite)
  const list = useRef<HTMLUListElement>(null)
  const [sending, setSending] = useState<string | null>(null)
  const turnOff = async (rule: string) => {
    if (!project || sending !== null) return
    setSending(rule)
    try {
      await calls.setProjectRule(project, rule, true)
      // The pressed card leaves with its rule, so focus waits on the list
      // rather than falling out of the popover, where Escape still closes it.
      list.current?.focus()
      toast.add({
        title: `Turned off ${rule} in ${project}`,
        description: 'Undo turns it back on',
      })
    } catch (error) {
      toast.add({
        title: `Could not turn off ${rule}`,
        description: error instanceof Error ? error.message : String(error),
        type: 'error',
      })
    } finally {
      setSending(null)
    }
  }
  return (
    <ul ref={list} tabIndex={-1} className="flex flex-col outline-none">
      {findings.map((finding, index) => (
        <li
          // A frame can break one rule at several places, so the index keeps
          // each key unique where rule, line, and message all repeat.
          // oxlint-disable-next-line react/no-array-index-key
          key={`${finding.rule}:${finding.location?.startOffset ?? ''}:${index}`}
          data-severity={finding.severity}
          className="grid grid-cols-[14px_1fr] gap-1.5 rounded-md p-1.5 hover:bg-accent data-[severity=error]:[--h:var(--destructive)] data-[severity=warning]:[--h:var(--note)]"
        >
          <TriangleAlert
            role="img"
            aria-label={finding.severity === 'error' ? 'Error' : 'Warning'}
            className="mt-px size-[11px] text-[var(--h)]"
            strokeWidth={2}
          />
          <div className="min-w-0">
            <p className="text-xs break-words">
              <span className="font-semibold">{finding.rule}</span>
              <Where finding={finding} />
            </p>
            <p className="mt-0.5 text-[11px] break-words text-muted-foreground">
              {finding.message}
            </p>
            {project && canWrite ? (
              <Button
                variant="secondary"
                size="xs"
                // The visible text leads the name, and the rule tells the
                // cards' buttons apart.
                aria-label={`Turn off in ${project}, ${finding.rule}`}
                disabled={sending !== null}
                onClick={() => void turnOff(finding.rule)}
                className="mt-1.5 max-w-full text-[11px]"
              >
                <span className="truncate">Turn off in {project}</span>
              </Button>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  )
}

function Where({ finding }: { finding: Finding }) {
  const file = otherFile(finding)
  const line = finding.location ? `line ${finding.location.line}` : null
  const where = [file, line].filter(Boolean).join(', ')
  if (!where) return null
  return <span className="text-muted-foreground"> · {where}</span>
}

/**
 * The finding's path under its project, such as `assets/site.css`, when it
 * sits in a file the frame links rather than the frame's own.
 */
function otherFile(finding: Finding): string | null {
  if (finding.frame === null || finding.path === `${finding.frame}.html`) {
    return null
  }
  const project = `${finding.frame.split('/')[0]}/`
  return finding.path.startsWith(project)
    ? finding.path.slice(project.length)
    : finding.path
}
