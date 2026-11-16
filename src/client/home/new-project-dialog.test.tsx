import '../styles.css'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { liveStore } from '@/client/live/store'
import { createStructure } from '@/client/live/structure'
import { projectStore } from '@/client/projects/actions'
import type { KitRecord } from '@/shared/kits'
import { boardOf } from '@/test/board'

import { NewProjectDialog } from './new-project-dialog'

const KITS = async (): Promise<KitRecord[]> => [
  {
    name: 'sketch',
    title: 'Sketch',
    description: 'Hand drawn, for brainstorms',
    source: 'shipped',
    preview: null,
  },
]

interface Sent {
  path: string
  body: unknown
}

function server() {
  const sent: Sent[] = []
  const calls = createStructure(async (path, init) => {
    sent.push({ path: String(path), body: JSON.parse(String(init?.body)) })
    return Response.json({ ok: true, data: { name: 'untitled' } })
  })
  return { sent, calls }
}

describe('NewProjectDialog', () => {
  beforeEach(() => {
    liveStore.setState({ canWrite: true, board: boardOf() })
    projectStore.setState({ creating: true })
  })

  afterEach(() => {
    liveStore.setState({ canWrite: false, board: null })
    projectStore.setState({ creating: false, focused: null, renaming: null })
  })

  it('adds the project and installs the kit picked on Create project', async () => {
    const user = userEvent.setup()
    const { sent, calls } = server()
    render(<NewProjectDialog calls={calls} loadKits={KITS} />)

    await user.click(await screen.findByRole('radio', { name: 'Sketch' }))
    await user.click(screen.getByRole('button', { name: 'Create project' }))

    await expect
      .poll(() => sent.map((each) => each.path))
      .toEqual(['/api/project/add', '/api/kits/install'])
    expect(projectStore.getState().creating).toBe(false)
  })

  it('opens on Blank, so Enter adds a project with no kit', async () => {
    const user = userEvent.setup()
    const { sent, calls } = server()
    render(<NewProjectDialog calls={calls} loadKits={KITS} />)

    await expect
      .poll(() => document.activeElement)
      .toBe(screen.getByRole('radio', { name: 'Blank' }))
    await user.keyboard('{Enter}')

    await expect
      .poll(() => sent.map((each) => each.path))
      .toEqual(['/api/project/add'])
  })

  it('names the folder and the kit Create project writes', async () => {
    const user = userEvent.setup()
    render(<NewProjectDialog calls={server().calls} loadKits={KITS} />)

    await user.click(await screen.findByRole('radio', { name: 'Sketch' }))

    expect(screen.getByText(/with the Sketch tokens/)).toBeInTheDocument()
  })

  it('closes on Escape, adding nothing', async () => {
    const user = userEvent.setup()
    const { sent, calls } = server()
    render(<NewProjectDialog calls={calls} loadKits={KITS} />)
    await screen.findByRole('radio', { name: 'Sketch' })

    await user.keyboard('{Escape}')

    await expect.poll(() => projectStore.getState().creating).toBe(false)
    expect(sent).toEqual([])
  })
})
