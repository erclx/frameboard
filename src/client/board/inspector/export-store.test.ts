import { describe, expect, it } from 'vitest'

import { elementExportName, exportBaseName } from './export-store'

describe('exportBaseName', () => {
  it.each([
    ['a plain name', 'landing', 'landing'],
    ['a name padded with spaces', '  landing  ', 'landing'],
    ['a forward slash', 'marketing/landing', 'marketing-landing'],
    ['a backslash', 'marketing\\landing', 'marketing-landing'],
    ['leading dots', '..landing', 'landing'],
    ['a dot inside the name', 'landing.v2', 'landing.v2'],
    ['a path climbing out', '../../etc/passwd', 'etc-passwd'],
    ['an empty field', '', 'hero'],
    ['spaces alone', '   ', 'hero'],
    ['dots and slashes alone', './..', 'hero'],
  ])('reads %s', (_case, typed, expected) => {
    expect(exportBaseName(typed, 'hero')).toBe(expected)
  })
})

describe('elementExportName', () => {
  it.each([
    ['a named element', 'hero', 'Primary button', 'hero-primary-button'],
    ['a tag name', 'hero', 'h1', 'hero-h1'],
    ['punctuation in the name', 'hero', 'Sign up, now!', 'hero-sign-up-now'],
    ['a name with nothing to keep', 'hero', '…', 'hero-element'],
  ])('joins the frame to %s', (_case, frame, element, expected) => {
    expect(elementExportName(frame, element)).toBe(expected)
  })
})
