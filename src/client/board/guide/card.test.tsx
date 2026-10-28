import '../../styles.css'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'

import { pinnedProjects } from '@/client/home/pins'
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
    sections: [],
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
    localStorage.clear()
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

  it('carries a pin on untitled to the name the guide gives it', async () => {
    localStorage.setItem('frameboard.home.pins', JSON.stringify(['untitled']))
    const user = userEvent.setup()
    renderCard()

    await user.clear(
      screen.getByRole('textbox', { name: 'What are you designing?' }),
    )
    await user.type(
      screen.getByRole('textbox', { name: 'What are you designing?' }),
      'acme{Enter}',
    )

    await expect.poll(() => [...pinnedProjects()]).toEqual(['acme'])
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

  it('writes nothing on the look step, and the accent and font picked on Finish', async () => {
    const user = userEvent.setup()
    const { sent, calls } = server()
    renderCard({ calls })

    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(await screen.findByRole('button', { name: 'Next' }))
    await user.click(await screen.findByRole('radio', { name: 'Purple' }))
    await user.selectOptions(screen.getByRole('combobox'), 'Geist Mono')
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByRole('heading', { name: 'Who draws the first frame?' })
    expect(sent).toEqual([])
    await user.click(screen.getByRole('button', { name: 'Finish' }))

    await expect
      .poll(() => sent)
      .toEqual([
        {
          path: '/api/project/tokens',
          body: { ref: 'untitled', accent: 'purple', font: 'geist-mono' },
        },
      ])
  })

  it('offers every face a look may start from, each in its own face', async () => {
    const user = userEvent.setup()
    const { calls } = server()
    renderCard({ calls })

    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(await screen.findByRole('button', { name: 'Next' }))
    const options = await screen.findAllByRole('option')

    expect(
      options.map((option) => [
        option.textContent,
        getComputedStyle(option).fontFamily,
      ]),
    ).toEqual([
      ['Geist', 'Geist, sans-serif'],
      ['Geist Mono', '"Geist Mono", monospace'],
      ['Inter', 'Inter, sans-serif'],
      ['Source Serif 4', '"Source Serif 4", serif'],
    ])
  })

  it('posts the key of a new face picked on Finish', async () => {
    const user = userEvent.setup()
    const { sent, calls } = server()
    renderCard({ calls })

    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(await screen.findByRole('button', { name: 'Next' }))
    await user.selectOptions(
      await screen.findByRole('combobox'),
      'Source Serif 4',
    )
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(await screen.findByRole('button', { name: 'Finish' }))

    await expect
      .poll(() => sent)
      .toEqual([
        {
          path: '/api/project/tokens',
          body: { ref: 'untitled', accent: 'blue', font: 'source-serif-4' },
        },
      ])
  })

  it('re-picks the look on Back, and Finish writes the last pick', async () => {
    const user = userEvent.setup()
    const { sent, calls } = server()
    renderCard({ calls })

    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(await screen.findByRole('button', { name: 'Next' }))
    await user.click(await screen.findByRole('radio', { name: 'Purple' }))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(await screen.findByRole('button', { name: 'Back' }))
    await user.click(await screen.findByRole('radio', { name: 'Green' }))
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(await screen.findByRole('button', { name: 'Finish' }))

    await expect
      .poll(() => sent)
      .toEqual([
        {
          path: '/api/project/tokens',
          body: { ref: 'untitled', accent: 'green', font: 'geist' },
        },
      ])
  })

  it('adds the frame on Finish past a sheet that reached the project meanwhile', async () => {
    const user = userEvent.setup()
    const { sent, calls } = server((path) =>
      path === '/api/project/tokens'
        ? Response.json(
            {
              ok: false,
              error: {
                code: 'tokens-exist',
                message: 'untitled/tokens.css already exists.',
                details: {},
              },
            },
            { status: 409 },
          )
        : Response.json({
            ok: true,
            data: {
              ref: 'untitled/page-1/phone',
              box: { x: 0, y: 0, width: 390, height: 844 },
            },
          }),
    )
    renderCard({ calls })

    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(await screen.findByRole('button', { name: 'Next' }))
    await user.click(await screen.findByRole('button', { name: 'Next' }))
    await user.click(
      await screen.findByRole('radio', { name: /I’ll start myself/ }),
    )
    await user.click(screen.getByRole('button', { name: 'Finish' }))

    await expect
      .poll(() => sent.map((each) => each.path))
      .toEqual(['/api/project/tokens', '/api/frame/add'])
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
          body: {
            ref: 'untitled/page-1/tablet',
            width: 834,
            height: 1194,
            x: 0,
            y: 0,
          },
        },
      ])
  })

  it('names the folder holding .frameboard as where to open Claude Code', async () => {
    const user = userEvent.setup()
    receiveBoard(liveStore, {
      ...startBoard(),
      root: '/home/dev/acme/.frameboard',
    })
    renderCard({ loadTokens: BOARD_SHEET })

    await screen.findByText('1 of 3')
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(await screen.findByRole('button', { name: 'Next' }))

    expect(
      await screen.findByRole('radio', { name: /My agent/ }),
    ).toHaveAccessibleName(
      'My agent Paste this into Claude Code opened in /home/dev/acme',
    )
  })

  it('names the sheet Finish writes on the agent step after the look step', async () => {
    const user = userEvent.setup()
    renderCard()

    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(await screen.findByRole('button', { name: 'Next' }))
    await user.click(await screen.findByRole('button', { name: 'Next' }))
    await screen.findByRole('heading', { name: 'Who draws the first frame?' })

    expect(screen.getByText('untitled/tokens.css')).toBeInTheDocument()
  })

  it('holds the prompt inside the My agent card', async () => {
    const user = userEvent.setup()
    renderCard({ loadTokens: BOARD_SHEET })

    await screen.findByText('1 of 3')
    await user.click(screen.getByRole('button', { name: 'Next' }))
    await user.click(await screen.findByRole('button', { name: 'Next' }))

    const card = (
      await screen.findByRole('radio', { name: /My agent/ })
    ).closest('label')
    expect(
      screen
        .getByText('Draw a phone screen for untitled on frameboard')
        .closest('label'),
    ).toBe(card)
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
