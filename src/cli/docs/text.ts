import type { RuleDoc } from '@/server/checks/rule'

import type { VerbDoc } from '../commands/docs'
import type { contentFormat } from './content-format'

export interface DocsPayload {
  version: string
  verbs: VerbDoc[]
  exitCodes: Readonly<Record<string, number>>
  records: Readonly<Record<string, unknown>>
  contentFormat: ReturnType<typeof contentFormat>
  checks: { rules: RuleDoc[] }
}

const INDENT = '  '

/**
 * The human form of `docs`: one heading per section the JSON carries, with
 * the record schemas named rather than printed, since `--json` holds them whole.
 */
export function renderDocs(docs: DocsPayload): string {
  return [
    `frameboard ${docs.version}`,
    section('Verbs', docs.verbs.flatMap(verbLines)),
    section('Exit codes', table(Object.entries(docs.exitCodes))),
    section('Records', [
      `${INDENT}${Object.keys(docs.records).join(', ')}`,
      `${INDENT}Run frameboard docs --json for each record's JSON schema.`,
    ]),
    section('Content format', formatLines(docs.contentFormat)),
    section(
      'Check rules',
      docs.checks.rules.map(
        (rule) =>
          `${INDENT}${rule.id}  ${rule.tier}${rule.configKey ? `, on with checks.${rule.configKey}` : ''}. ${rule.description}`,
      ),
    ),
  ].join('\n\n')
}

function section(heading: string, lines: string[]): string {
  return [heading, ...lines].join('\n')
}

function verbLines(verb: VerbDoc): string[] {
  const usage = verb.arguments
    .map((argument) =>
      argument.required ? `<${argument.name}>` : `[${argument.name}]`,
    )
    .join(' ')
  return [
    `frameboard ${verb.name}${usage ? ` ${usage}` : ''}  ${verb.description}`,
    ...verb.options.map((option) => {
      const extras = [
        option.choices ? `one of ${option.choices.join(', ')}` : '',
        option.default === undefined
          ? ''
          : `default ${JSON.stringify(option.default)}`,
      ].filter(Boolean)
      return `${INDENT}${option.flags}  ${option.description}${extras.length ? ` (${extras.join(', ')})` : ''}`
    }),
  ]
}

function table(rows: [string, unknown][]): string[] {
  const width = Math.max(...rows.map(([name]) => name.length))
  return rows.map(([name, value]) => `${INDENT}${name.padEnd(width)}  ${value}`)
}

function formatLines(format: ReturnType<typeof contentFormat>): string[] {
  const sizes = Object.entries(format.frameSizes).map(
    ([name, size]) => `${name} ${size.width} × ${size.height}`,
  )
  return [
    'Folders',
    ...format.folders.map((line) => `${INDENT}${line}`),
    'Names',
    `${INDENT}Match ${format.names.pattern}, at most ${format.names.maxLength} characters. Reserved page names: ${format.names.reservedPageNames.join(', ')}.`,
    `${INDENT}${format.names.collision}`,
    'Frame sizes',
    `${INDENT}${sizes.join(', ')}, defaulting to ${format.defaultFrameSize}`,
    'Layout',
    ...format.layout.map((line) => `${INDENT}${line}`),
    'Assets',
    `${INDENT}${format.assets}`,
    'Look',
    ...format.look.map((line) => `${INDENT}${line}`),
  ]
}
