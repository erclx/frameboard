import type { Finding } from '@/shared/records/check'

/** The level a list of findings marks at, `error` when any of them is one. */
export function severityOf(findings: readonly Finding[]): Finding['severity'] {
  return findings.some((finding) => finding.severity === 'error')
    ? 'error'
    : 'warning'
}

/**
 * The classes of a findings count, read off the `data-severity` its element
 * carries. An error is a pill filled and ringed in the destructive hue, and
 * warnings alone are the count in the label's own grey with no fill, so a
 * board of warnings stays quiet and an error stands out.
 */
export const FINDINGS_MARK =
  'flex h-[18px] shrink-0 items-center gap-[3px] rounded-[9px] font-medium [--h:var(--destructive)] data-[severity=error]:bg-[color-mix(in_srgb,var(--h)_34%,transparent)] data-[severity=error]:pr-1.5 data-[severity=error]:pl-[5px] data-[severity=error]:text-[color-mix(in_srgb,var(--h)_55%,var(--foreground))] data-[severity=error]:shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--h)_75%,transparent)] data-[severity=warning]:px-0.5 data-[severity=warning]:text-muted-foreground'
