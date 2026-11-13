import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import { liveStore } from '@/client/live/store'
import { createStructure } from '@/client/live/structure'
import type { Finding } from '@/shared/records/check'

import { FindingsList } from './list'

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

describe('FindingsList turning a rule off', () => {
  const findings = [
    finding('studio/home/hero.html', 4),
    { ...finding('studio/home/hero.html', 9), rule: 'generic-font' },
  ]
  let sent: { path: string; body: unknown }[]
  let answer: () => Response

  const calls = createStructure(async (path, init) => {
    sent.push({ path: String(path), body: JSON.parse(String(init?.body)) })
    return answer()
  })

  beforeEach(() => {
    sent = []
    answer = () => Response.json({ ok: true, data: {} })
    liveStore.setState({ connected: true, canWrite: true })
  })

  it('posts the pressed card’s rule and the frame’s project', async () => {
    render(<FindingsList findings={findings} project="studio" calls={calls} />)

    await userEvent.click(
      screen.getByRole('button', { name: 'Turn off in studio, generic-font' }),
    )

    expect(sent).toEqual([
      {
        path: '/api/project/rule',
        body: { project: 'studio', rule: 'generic-font', off: true },
      },
    ])
  })

  it('keeps focus on the list once the rule is off', async () => {
    render(<FindingsList findings={findings} project="studio" calls={calls} />)

    await userEvent.click(
      screen.getByRole('button', { name: 'Turn off in studio, generic-font' }),
    )

    await expect
      .poll(() => document.activeElement)
      .toBe(screen.getByRole('list'))
  })

  it('draws no button in a tab that may not write', () => {
    liveStore.setState({ canWrite: false })

    render(<FindingsList findings={findings} project="studio" calls={calls} />)

    expect(screen.queryByRole('button')).toBeNull()
  })

  it('draws no button where no project is given', () => {
    render(<FindingsList findings={findings} calls={calls} />)

    expect(screen.queryByRole('button')).toBeNull()
  })
})
