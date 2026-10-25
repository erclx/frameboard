import { TriangleAlert } from 'lucide-react'

import type { Finding } from '@/shared/records/check'

/**
 * A frame's findings, each as its rule, the line it sits at when it has one,
 * and its message, which already ends on the fix. The badge's popover and
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
            <p className="text-xs">
              <span className="font-semibold">{finding.rule}</span>
              {finding.location ? (
                <span className="text-muted-foreground">
                  {' '}
                  · line {finding.location.line}
                </span>
              ) : null}
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
