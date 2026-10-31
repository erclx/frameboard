import type { Finding, FindingLocation } from '@/shared/records/check'

/** What `docs` prints about a rule, declared beside the rule itself. */
export interface RuleDoc {
  id: string
  /**
   * `exact` when the bytes settle it, `selector` when it reads the cascade,
   * `browser` when it reads a rendered page on the server.
   */
  tier: 'exact' | 'selector' | 'browser'
  /**
   * `error` when the frame renders wrong or cannot load, which fails `check`,
   * and `warning` when it renders and a style call is in question.
   */
  severity: Finding['severity']
  /** The `checks` key in `project.json` that turns it on, absent for a built-in rule. */
  configKey?: string
  description: string
}

interface FindingFields {
  frame: string | null
  path: string
  message: string
  location?: FindingLocation | null
}

/**
 * Builds findings for the rules `docs` declares, each at the level its doc
 * sets, so a module reports only the rules it documents.
 */
export function findingFor(docs: readonly RuleDoc[]) {
  return (rule: string, fields: FindingFields): Finding => {
    const doc = docs.find((candidate) => candidate.id === rule)
    if (!doc) throw new Error(`No rule doc declares ${rule}`)
    return {
      rule,
      severity: doc.severity,
      frame: fields.frame,
      path: fields.path,
      message: fields.message,
      location: fields.location ?? null,
    }
  }
}

/** One finding as `path:line:column  rule  message`, as `check` and the hook print it. */
export function formatFinding(finding: Finding): string {
  const at = finding.location
    ? `${finding.path}:${finding.location.line}:${finding.location.column}`
    : finding.path
  return `${at}  ${finding.rule}  ${finding.message}`
}
