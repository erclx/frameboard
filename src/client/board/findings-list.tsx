import { TriangleAlert } from 'lucide-react'

import type { Finding } from '@/shared/records/check'

/**
 * A frame's findings, each as its rule, the file it sits in when that is not
 * the frame's own, the line when it has one, and its message, which already ends on the fix. The badge's popover and
 * the inspector's Checks both draw it, the warning glyph in the destructive
 * hue for an error and the note hue for a warning.
 */
export function FindingsList({ findings }: { findings: readonly Finding[] }) {
  return (
    <ul className="flex flex-col">
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
