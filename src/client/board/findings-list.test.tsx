import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { Finding } from '@/shared/records/check'

import { FindingsList } from './findings-list'

function finding(path: string, line: number | null): Finding {
  return {
    rule: 'unknown-token',
    severity: 'warning',
    frame: 'studio/home/hero',
    path,
    message: 'var(--brand) names a custom property nothing declares.',
    location:
      line === null ? null : { line, column: 3, startOffset: 0, endOffset: 1 },
  }
}

describe('FindingsList', () => {
  it('shows only the line for a finding in the frame’s own file', () => {
    render(<FindingsList findings={[finding('studio/home/hero.html', 4)]} />)

    expect(screen.getByRole('listitem')).toHaveTextContent(
      'unknown-token · line 4',
    )
  })

  it('shows a linked sheet’s path beside the line', () => {
    render(<FindingsList findings={[finding('studio/home/site.css', 1)]} />)

    expect(screen.getByRole('listitem')).toHaveTextContent(
      'unknown-token · home/site.css, line 1',
    )
  })

  it('shows a linked sheet’s path for a finding with no line', () => {
    render(
      <FindingsList findings={[finding('studio/assets/site.css', null)]} />,
    )

    expect(screen.getByRole('listitem')).toHaveTextContent(
      'unknown-token · assets/site.css',
    )
  })
})
