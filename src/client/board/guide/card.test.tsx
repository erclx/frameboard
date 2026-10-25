import '../../styles.css'

import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'

import { liveStore, receiveBoard } from '@/client/live/store'
import { createStructure } from '@/client/live/structure'
import type { PageRecord } from '@/shared/records/list'
import type { TokenTable } from '@/shared/records/tokens'

import { Canvas } from '../canvas'
import { GuideCard } from './card'
import { resetGuide } from './state'

function startPage(project = 'untitled'): PageRecord {
  return {
    ref: `${project}/page-1`,
    project,
    name: 'page-1',
    path: `/board/${project}/page-1`,
    index: 0,
    layoutError: null,
    frames: [],
  }
}

function startBoard() {
  return {
    root: '/board',
    projects: [
      {
        name: 'untitled',
        path: '/board/untitled',
        modifiedAt: '2026-10-25T09:00:00.000Z',
        createdAt: '2026-10-25T09:00:00.000Z',
        projectFileError: null,
        pages: [startPage()],
      },
    ],
  }
}

const NO_SHEET = async (): Promise<TokenTable> => ({ sheets: [], tokens: [] })
const BOARD_SHEET = async (): Promise<TokenTable> => ({
  sheets: [{ path: 'tokens.css', kind: 'board', error: null }],
  tokens: [],
})

interface Sent {
  path: string
  body: unknown
}

/** A server answering each write with `answer`, recording what the card sent. */
function server(
  answer: (path: string) => Response = () =>
    Response.json({ ok: true, data: {} }),
) {
  const sent: Sent[] = []
  const calls = createStructure(async (path, init) => {
    sent.push({ path: String(path), body: JSON.parse(String(init?.body)) })
    return answer(String(path))
  })
  return { sent, calls }
}

function renderCard({
  calls = server().calls,
  loadTokens = NO_SHEET,
}: {
  calls?: ReturnType<typeof createStructure>
  loadTokens?: () => Promise<TokenTable>
} = {}) {
  const memory = memoryLocation({ path: '/p/untitled/page-1', record: true })
  render(
    <Router hook={memory.hook}>
      <GuideCard page={startPage()} calls={calls} loadTokens={loadTokens} />
    </Router>,
  )
  return memory
}

describe('GuideCard', () => {
  beforeEach(() => {
    resetGuide()
    receiveBoard(liveStore, startBoard())
    liveStore.setState({ canWrite: true })
  })

  afterEach(() => {
    resetGuide()
    liveStore.setState({ canWrite: false, board: null })
  })

  it('renames the project to the folder the typed name makes', async () => {
    const user = userEvent.setup()
    const { sent, calls } = server()
    renderCard({ calls })

    await user.clear(
      screen.getByRole('textbox', { name: 'What are you designing?' }),
    )
    await user.type(
      screen.getByRole('textbox', { name: 'What are you designing?' }),
      'Acme mobile{Enter}',
    )

    await expect
      .poll(() => sent)
      .toEqual([
        {
          path: '/api/project/rename',
          body: { ref: 'untitled', name: 'acme-mobile' },
        },
      ])
  })

  it('moves the board to the renamed project and on to the size step', async () => {
    const user = userEvent.setup()
    const memory = renderCard()

    await user.clear(
      screen.getByRole('textbox', { name: 'What are you designing?' }),
    )
    await user.type(
      screen.getByRole('textbox', { name: 'What are you designing?' }),
      'acme{Enter}',
    )

    expect(
      await screen.findByRole('heading', { name: 'Which screen first?' }),
    ).toHaveFocus()
    expect(memory.history.at(-1)).toBe('/p/acme/page-1')
  })

  it('keeps the name step open with the reason under the field on a refused name', async () => {
    const user = userEvent.setup()
    const { calls } = server(() =>
      Response.json(
        {
          ok: false,
          error: {
            code: 'invalid-name',
            message: '.x is not a valid project name.',
            details: {},
          },
        },
        { status: 400 },
      ),
    )
    renderCard({ calls })

    await user.clear(
      screen.getByRole('textbox', { name: 'What are you designing?' }),
    )
    await user.type(
      screen.getByRole('textbox', { name: 'What are you designing?' }),
      '.x{Enter}',
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '.x is not a valid project name.',
    )
    expect(screen.getByText('1 of 4')).toBeInTheDocument()
  })

  it('asks for a name rather than renaming to nothing', async () => {
    const user = userEvent.setup()
    const { sent, calls } = server()
    renderCard({ calls })

    await user.clear(
      screen.getByRole('textbox', { name: 'What are you designing?' }),
    )
    await user.click(screen.getByRole('button', { name: 'Next' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Enter a name for the project.',
    )
    expect(sent).toEqual([])
  })

  it('writes the starter sheet with the accent and font picked', async () => {
    const user = userEvent.setup()
    const { sent, calls } = server()
    renderCard({ calls })

    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(await screen.findByRole('button', { name: 'Next' }))
    await user.click(await screen.findByRole('radio', { name: 'Purple' }))
    await user.selectOptions(screen.getByRole('combobox'), 'Geist Mono')
    await user.click(screen.getByRole('button', { name: 'Next' }))

    await expect
      .poll(() => sent)
      .toEqual([
        {
          path: '/api/project/tokens',
          body: { ref: 'untitled', accent: 'purple', font: 'geist-mono' },
        },
      ])
  })

  it('locks the look on Back once the guide has written the sheet', async () => {
    const user = userEvent.setup()
    const { sent, calls } = server()
    let written = false
    const loadTokens = async (): Promise<TokenTable> => ({
      sheets: written
        ? [{ path: 'untitled/tokens.css', kind: 'project', error: null }]
        : [],
      tokens: [],
    })
    renderCard({ calls, loadTokens })

    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(await screen.findByRole('button', { name: 'Next' }))
    await user.click(await screen.findByRole('button', { name: 'Next' }))
    await screen.findByRole('heading', { name: 'Who draws the first frame?' })
    written = true
    act(() => receiveBoard(liveStore, startBoard()))
    await user.click(screen.getByRole('button', { name: 'Back' }))

    await waitFor(() =>
      expect(screen.getByRole('radio', { name: 'Purple' })).toBeDisabled(),
    )
    await user.click(screen.getByRole('button', { name: 'Next' }))
    expect(
      await screen.findByRole('heading', {
        name: 'Who draws the first frame?',
      }),
    ).toBeInTheDocument()
    expect(
      sent.filter((each) => each.path === '/api/project/tokens'),
    ).toHaveLength(1)
  })

  it('drops the look step where a token sheet already reaches the project', async () => {
    const user = userEvent.setup()
    renderCard({ loadTokens: BOARD_SHEET })

    expect(await screen.findByText('1 of 3')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(await screen.findByRole('button', { name: 'Next' }))

    expect(
      await screen.findByRole('heading', {
        name: 'Who draws the first frame?',
      }),
    ).toBeInTheDocument()
  })

  it('adds a frame at the size picked when the developer starts themselves', async () => {
    const user = userEvent.setup()
    const { sent, calls } = server((path) =>
      path === '/api/frame/add'
        ? Response.json({
            ok: true,
            data: {
              ref: 'untitled/page-1/tablet',
              box: { x: 0, y: 0, width: 834, height: 1194 },
            },
          })
        : Response.json({ ok: true, data: {} }),
    )
    renderCard({ calls, loadTokens: BOARD_SHEET })

    await screen.findByText('1 of 3')
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(await screen.findByRole('radio', { name: /Tablet/ }))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(
      await screen.findByRole('radio', { name: /I’ll start myself/ }),
    )
    await user.click(screen.getByRole('button', { name: 'Finish' }))

    await expect
      .poll(() => sent)
      .toEqual([
        {
          path: '/api/frame/add',
          body: { ref: 'untitled/page-1/tablet', size: 'tablet', x: 0, y: 0 },
        },
      ])
  })

  it('offers the agent a prompt naming the size and the project', async () => {
    const user = userEvent.setup()
    renderCard({ loadTokens: BOARD_SHEET })

    await screen.findByText('1 of 3')
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(await screen.findByRole('button', { name: 'Next' }))

    expect(
      await screen.findByText('Draw a phone screen for untitled on frameboard'),
    ).toBeInTheDocument()
  })
})

describe('the guide on the canvas', () => {
  beforeEach(() => {
    resetGuide()
    receiveBoard(liveStore, startBoard())
  })

  afterEach(() => {
    resetGuide()
    liveStore.setState({ canWrite: false, board: null })
  })

  function renderCanvas() {
    const memory = memoryLocation({ path: '/p/untitled/page-1' })
    return render(
      <Router hook={memory.hook}>
        <div style={{ width: 800, height: 600 }}>
          <Canvas page={startPage()} reloads={{}} />
        </div>
      </Router>,
    )
  }

  it('stands in for the empty page note on an untouched board', () => {
    liveStore.setState({ canWrite: true })

    renderCanvas()

    expect(
      screen.getByRole('region', { name: 'Set up your board' }),
    ).toBeInTheDocument()
  })

  it('leaves the empty page note on a tab that only reads', () => {
    liveStore.setState({ canWrite: false })

    renderCanvas()

    expect(screen.getByRole('status')).toHaveTextContent(
      'This page has no frames',
    )
  })

  it('gives way to the empty page note once skipped', async () => {
    const user = userEvent.setup()
    liveStore.setState({ canWrite: true })
    renderCanvas()

    await user.click(screen.getByRole('button', { name: 'Skip setup' }))

    expect(screen.getByRole('status')).toHaveTextContent(
      'This page has no frames',
    )
  })
})
