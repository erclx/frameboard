import { describe, expect, it } from 'vitest'

import { findingFor, formatFinding, type RuleDoc, withoutOff } from './rule'
import { RULES } from './run'

const DOCS: RuleDoc[] = [
  { id: 'broken', tier: 'exact', severity: 'error', description: 'Broken' },
  { id: 'styled', tier: 'exact', severity: 'warning', description: 'Styled' },
]

const fields = { frame: 'home/hero', path: 'site/home/hero.html', message: 'm' }

describe('RULES', () => {
  it.each(RULES.map((rule) => [rule.id, rule.severity]))(
    '%s carries a level',
    (_id, severity) => {
      expect(['error', 'warning']).toContain(severity)
    },
  )
})

describe('findingFor', () => {
  it('reports an error rule at error', () => {
    const finding = findingFor(DOCS)

    expect(finding('broken', fields).severity).toBe('error')
  })

  it('reports a warning rule at warning', () => {
    const finding = findingFor(DOCS)

    expect(finding('styled', fields).severity).toBe('warning')
  })

  it('refuses a rule its docs never declare', () => {
    const finding = findingFor(DOCS)

    expect(() => finding('unlisted', fields)).toThrow('unlisted')
  })
})

describe('formatFinding', () => {
  const finding = findingFor(DOCS)('broken', fields)

  it('prints the path of a finding at the frame width', () => {
    expect(formatFinding(finding)).toBe('site/home/hero.html  broken  m')
  })

  it('prints the linked width after the path', () => {
    expect(formatFinding({ ...finding, width: 390 })).toBe(
      'site/home/hero.html@390  broken  m',
    )
  })
})

describe('withoutOff', () => {
  const finding = findingFor(DOCS)
  const findings = [finding('broken', fields), finding('styled', fields)]

  it('drops the findings of a rule turned off and keeps the rest', () => {
    expect(withoutOff(findings, ['styled'])).toEqual([findings[0]])
  })

  it('drops an error rule as it does a warning', () => {
    expect(withoutOff(findings, ['broken'])).toEqual([findings[1]])
  })

  it('keeps every finding when the list names an id no rule declares', () => {
    expect(withoutOff(findings, ['unlisted'])).toEqual(findings)
  })

  it.each([
    ['no list', undefined],
    ['an empty list', []],
  ])('keeps every finding for %s', (_, off) => {
    expect(withoutOff(findings, off)).toEqual(findings)
  })
})
