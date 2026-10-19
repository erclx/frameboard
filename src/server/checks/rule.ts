import type { Finding, FindingLocation } from '@/shared/records/check'

/** What `docs` prints about a rule, declared beside the rule itself. */
export interface RuleDoc {
  id: string
  /**
   * `exact` when the bytes settle it, `selector` when it reads the cascade,
   * `browser` when it reads a rendered page on the server.
   */
  tier: 'exact' | 'selector' | 'browser'
  /** The `checks` key in `project.json` that turns it on, absent for a built-in rule. */
  configKey?: string
  description: string
}

/** A finding at `error` unless the rule asks for `warning`. */
export function finding(
  rule: string,
  fields: {
    frame: string | null
    path: string
    message: string
    location?: FindingLocation | null
    severity?: Finding['severity']
  },
): Finding {
  return {
    rule,
    severity: fields.severity ?? 'error',
    frame: fields.frame,
    path: fields.path,
    message: fields.message,
    location: fields.location ?? null,
  }
}

/** One finding as `path:line:column  rule  message`, as `check` and the hook print it. */
export function formatFinding(finding: Finding): string {
  const at = finding.location
    ? `${finding.path}:${finding.location.line}:${finding.location.column}`
    : finding.path
  return `${at}  ${finding.rule}  ${finding.message}`
}
