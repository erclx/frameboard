import '../../../styles.css'

import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'

import { createSelectionStore } from '../../selection'
import { browserHistory, recorder } from './fixtures'
import { TextSection } from './text'
import { forgetText, type WriteElement, writeElement } from './write'

describe('TextSection', () => {
  const AT = { frame: 'studio/home/hero', index: 5 }

  afterEach(() => {
    forgetText(AT)
  })

  /** A write answered as the route answers an edit the agent's write to the element refused. */
  function colliding(moved = false): WriteElement {
    return (change) =>
      writeElement('studio/home', { ...AT, hash: 'a'.repeat(64) }, change, {
        selection: createSelectionStore(),
        send: async () =>
          Response.json(
            {
              ok: false,
              error: {
                code: 'stale-address',
                message:
                  'the agent changed this <h1> in hero.html while your edit waited, so nothing was written',
                details: { ref: AT.frame, index: AT.index, moved },
              },
            },
            { status: 409 },
          ),
        notify: () => {},
      })
  }

  it('keeps no draft once the agent’s write also moved the element’s index', async () => {
    await colliding(true)({ kind: 'text', value: 'Welcome' })

    render(
      <TextSection
        text="Hello"
        keepsBreaks={false}
        disabled={false}
        write={recorder().write}
        element={AT}
      />,
    )

    expect(screen.getByRole('textbox', { name: 'Text' })).toHaveValue('Hello')
    expect(screen.queryByRole('textbox', { name: 'Name' })).toBeNull()
  })

  it('holds its height as the field takes and loses focus, so the sections below stay still', async () => {
    render(
      <TextSection
        text="Hello"
        keepsBreaks={false}
        disabled={false}
        write={recorder().write}
        element={AT}
      />,
    )
    const section = screen.getByRole('region', { name: 'Text' })
    const before = section.getBoundingClientRect().height

    await userEvent.click(screen.getByRole('textbox', { name: 'Text' }))

    expect(screen.getByText(/to apply/)).toBeVisible()
    expect(section.getBoundingClientRect().height).toBe(before)
  })

  it('sets the key hint clear of the focused field’s 3px ring', async () => {
    render(
      <TextSection
        text="Hello"
        keepsBreaks={false}
        disabled={false}
        write={recorder().write}
        element={AT}
      />,
    )
    const area = screen.getByRole('textbox', { name: 'Text' })

    await userEvent.click(area)

    const hint = screen.getByText(/to apply/).getBoundingClientRect()
    expect(
      hint.top - area.getBoundingClientRect().bottom,
    ).toBeGreaterThanOrEqual(8)
  })

  it('keeps the typed text as a draft once the agent changed the element', async () => {
    render(
      <TextSection
        text="Hello"
        keepsBreaks={false}
        disabled={false}
        write={colliding()}
        element={AT}
      />,
    )

    const area = screen.getByRole('textbox', { name: 'Text' })
    await userEvent.clear(area)
    await userEvent.type(area, 'Welcome{Enter}')

    await expect.poll(() => (area as HTMLTextAreaElement).value).toBe('Welcome')
  })

  it('shows the kept draft once the element is selected again, and applies it on Enter', async () => {
    await colliding()({ kind: 'text', value: 'Welcome' })
    const { changes, write } = recorder()

    render(
      <TextSection
        text="Hello"
        keepsBreaks={false}
        disabled={false}
        write={write}
        element={AT}
      />,
    )
    const area = screen.getByRole('textbox', { name: 'Text' })
    expect(area).toHaveValue('Welcome')
    await userEvent.type(area, '{Enter}')

    expect(changes).toEqual([{ kind: 'text', value: 'Welcome' }])
  })

  it('forgets the kept draft on Esc', async () => {
    await colliding()({ kind: 'text', value: 'Welcome' })
    const { changes, write } = recorder()
    const { unmount } = render(
      <TextSection
        text="Hello"
        keepsBreaks={false}
        disabled={false}
        write={write}
        element={AT}
      />,
    )

    await userEvent.type(
      screen.getByRole('textbox', { name: 'Text' }),
      '{Escape}',
    )
    unmount()
    render(
      <TextSection
        text="Hello"
        keepsBreaks={false}
        disabled={false}
        write={write}
        element={AT}
      />,
    )

    expect(screen.getByRole('textbox', { name: 'Text' })).toHaveValue('Hello')
    expect(changes).toEqual([])
  })

  it('keeps the break of a text that shows its breaks as a character is typed into it', async () => {
    const { changes, write } = recorder()
    render(
      <TextSection
        text={'One\nTwo'}
        keepsBreaks
        disabled={false}
        write={write}
        element={AT}
      />,
    )

    await userEvent.type(
      screen.getByRole('textbox', { name: 'Text' }),
      's{Enter}',
    )

    expect(changes).toEqual([{ kind: 'text', value: 'One\nTwos' }])
  })

  it('writes the text on Cmd+Enter', async () => {
    const { changes, write } = recorder()
    render(
      <TextSection
        text="Hello"
        keepsBreaks={false}
        disabled={false}
        write={write}
        element={AT}
      />,
    )

    const area = screen.getByRole('textbox', { name: 'Text' })
    await userEvent.clear(area)
    await userEvent.type(area, 'Welcome{Meta>}{Enter}{/Meta}')

    expect(changes).toEqual([{ kind: 'text', value: 'Welcome' }])
  })

  it('writes the text once on Enter and keeps nothing for the blur', async () => {
    const { changes, write } = recorder()
    render(
      <TextSection
        text="Hello"
        keepsBreaks={false}
        disabled={false}
        write={write}
        element={AT}
      />,
    )

    const area = screen.getByRole('textbox', { name: 'Text' })
    await userEvent.clear(area)
    await userEvent.type(area, 'Welcome{Enter}')
    await userEvent.tab()

    expect(changes).toEqual([{ kind: 'text', value: 'Welcome' }])
  })

  it('adds no line on Shift+Enter', async () => {
    const { changes, write } = recorder()
    render(
      <TextSection
        text="Hello"
        keepsBreaks={false}
        disabled={false}
        write={write}
        element={AT}
      />,
    )

    const area = screen.getByRole('textbox', { name: 'Text' })
    await userEvent.type(area, '{Shift>}{Enter}{/Shift}')

    expect(area).toHaveValue('Hello')
    expect(changes).toEqual([])
  })

  it('writes a pasted line break as a space', async () => {
    const { changes, write } = recorder()
    render(
      <TextSection
        text="Hello"
        keepsBreaks={false}
        disabled={false}
        write={write}
        element={AT}
      />,
    )

    const area = screen.getByRole('textbox', { name: 'Text' })
    await userEvent.clear(area)
    await userEvent.paste('Two\r\nlines')
    await userEvent.keyboard('{Enter}')

    expect(changes).toEqual([{ kind: 'text', value: 'Two lines' }])
  })

  it('hints the keys only while it has focus', async () => {
    const { write } = recorder()
    render(
      <TextSection
        text="Hello"
        keepsBreaks={false}
        disabled={false}
        write={write}
        element={AT}
      />,
    )

    expect(screen.getByText('to apply', { exact: false })).not.toBeVisible()
    await userEvent.click(screen.getByRole('textbox', { name: 'Text' }))

    expect(screen.getByText('to apply', { exact: false })).toBeVisible()
  })

  it('cancels on Esc and writes nothing', async () => {
    const { changes, write } = recorder()
    render(
      <TextSection
        text="Hello"
        keepsBreaks={false}
        disabled={false}
        write={write}
        element={AT}
      />,
    )

    const area = screen.getByRole('textbox', { name: 'Text' })
    await userEvent.type(area, ' there{Escape}')

    expect(changes).toEqual([])
    expect(area).toHaveValue('Hello')
  })

  it('shows the stored text again after a refused write', async () => {
    const { write } = recorder(false)
    render(
      <TextSection
        text="Hello"
        keepsBreaks={false}
        disabled={false}
        write={write}
        element={AT}
      />,
    )

    const area = screen.getByRole('textbox', { name: 'Text' })
    await userEvent.clear(area)
    await userEvent.type(area, 'Welcome')
    await userEvent.tab()

    await expect.poll(() => (area as HTMLTextAreaElement).value).toBe('Hello')
  })

  it.each(['historyUndo', 'historyRedo'] as const)(
    'drops a %s while the field is unfocused, and writes nothing on the next blur',
    async (inputType) => {
      const { changes, write } = recorder()
      render(
        <TextSection
          text="Hello"
          keepsBreaks={false}
          disabled={false}
          write={write}
          element={AT}
        />,
      )
      const area = screen.getByRole('textbox', { name: 'Text' })

      browserHistory(area as HTMLTextAreaElement, 'Hel', inputType)
      act(() => (area as HTMLTextAreaElement).focus())
      act(() => (area as HTMLTextAreaElement).blur())

      expect(changes).toEqual([])
      expect(area).toHaveValue('Hello')
    },
  )

  it('follows a historyUndo while the field is focused', async () => {
    const { changes, write } = recorder()
    render(
      <TextSection
        text="Hello"
        keepsBreaks={false}
        disabled={false}
        write={write}
        element={AT}
      />,
    )
    const area = screen.getByRole('textbox', { name: 'Text' })

    act(() => (area as HTMLTextAreaElement).focus())
    browserHistory(area as HTMLTextAreaElement, 'Hel')
    act(() => (area as HTMLTextAreaElement).blur())

    expect(changes).toEqual([{ kind: 'text', value: 'Hel' }])
  })
})
