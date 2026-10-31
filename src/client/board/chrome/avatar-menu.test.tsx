import '../../styles.css'

import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { liveStore } from '@/client/live/store'

import { AvatarMenu } from './avatar-menu'

/** The bodies the menu posted to `/api/author`, answered as the server would. */
let saved: unknown[]

beforeEach(() => {
  saved = []
  vi.stubGlobal(
    'fetch',
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input), location.href)
      if (url.pathname === '/api/author' && init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as { name: string }
        saved.push(body)
        return Response.json({
          ok: true,
          data:
            body.name === ''
              ? { name: null, source: null }
              : { name: body.name, source: 'config' },
        })
      }
      return Response.json({ ok: true, data: { name: null, source: null } })
    },
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  act(() => liveStore.setState({ canWrite: false }))
})

function writing(): void {
  act(() => liveStore.setState({ canWrite: true }))
}

describe('AvatarMenu', () => {
  describe('captions', () => {
    it('captions a name from git', async () => {
      render(<AvatarMenu name="Eric Le" source="git" />)

      await userEvent.click(
        screen.getByRole('button', { name: 'Eric Le, from git user.name' }),
      )

      expect(await screen.findByText('From git user.name')).toBeInTheDocument()
    })

    it('captions a name saved on this machine', async () => {
      render(<AvatarMenu name="Grace Hopper" source="config" />)

      await userEvent.click(
        screen.getByRole('button', {
          name: 'Grace Hopper, saved on this machine',
        }),
      )

      expect(
        await screen.findByText('Saved on this machine'),
      ).toBeInTheDocument()
    })
  })

  describe('editing the name', () => {
    it('saves an edited name and closes the field', async () => {
      writing()
      render(<AvatarMenu name="Eric Le" source="git" />)
      await userEvent.click(screen.getByRole('button', { name: /Eric Le/ }))

      await userEvent.click(
        await screen.findByRole('menuitem', {
          name: 'Edit your name, Eric Le',
        }),
      )
      await userEvent.keyboard('Grace Hopper{Enter}')

      expect(saved).toEqual([{ name: 'Grace Hopper' }])
      expect(screen.queryByRole('textbox', { name: 'Your name' })).toBeNull()
    })

    it('clears the saved name on an emptied field', async () => {
      writing()
      render(<AvatarMenu name="Grace Hopper" source="config" />)
      await userEvent.click(
        screen.getByRole('button', { name: /Grace Hopper/ }),
      )

      await userEvent.click(
        await screen.findByRole('menuitem', { name: /Edit your name/ }),
      )
      await userEvent.keyboard('{Backspace}{Enter}')

      expect(saved).toEqual([{ name: '' }])
    })

    it('cancels on Esc, saving nothing and keeping the menu open', async () => {
      writing()
      render(<AvatarMenu name="Eric Le" source="git" />)
      await userEvent.click(screen.getByRole('button', { name: /Eric Le/ }))

      await userEvent.click(
        await screen.findByRole('menuitem', {
          name: 'Edit your name, Eric Le',
        }),
      )
      await userEvent.keyboard('Grace{Escape}')

      expect(saved).toEqual([])
      expect(screen.queryByRole('textbox', { name: 'Your name' })).toBeNull()
      expect(
        screen.getByRole('menuitem', { name: 'Edit your name, Eric Le' }),
      ).toHaveFocus()
    })

    it('keeps typed letters in the field rather than the menu typeahead', async () => {
      writing()
      render(<AvatarMenu name="Eric Le" source="git" />)
      await userEvent.click(screen.getByRole('button', { name: /Eric Le/ }))

      await userEvent.click(
        await screen.findByRole('menuitem', {
          name: 'Edit your name, Eric Le',
        }),
      )
      await userEvent.keyboard('Docs')

      expect(screen.getByRole('textbox', { name: 'Your name' })).toHaveValue(
        'Docs',
      )
    })

    it('shows the name row but opens no field on a read-only tab', async () => {
      render(<AvatarMenu name="Eric Le" source="git" />)
      await userEvent.click(screen.getByRole('button', { name: /Eric Le/ }))

      await screen.findByText('From git user.name')

      expect(
        screen.queryByRole('menuitem', { name: /Edit your name/ }),
      ).toBeNull()
    })
  })

  describe('with no name', () => {
    it('offers Set your name, which opens an empty field', async () => {
      writing()
      render(<AvatarMenu name={null} />)
      await userEvent.click(screen.getByRole('button', { name: 'Account' }))

      await userEvent.click(
        await screen.findByRole('menuitem', { name: 'Set your name' }),
      )
      const field = screen.getByRole('textbox', { name: 'Your name' })
      expect(field).toHaveValue('')
      await userEvent.keyboard('Ada Lovelace{Enter}')

      expect(saved).toEqual([{ name: 'Ada Lovelace' }])
    })

    it('offers no Set your name while the name is still being read', async () => {
      writing()
      render(<AvatarMenu name={undefined} />)
      await userEvent.click(screen.getByRole('button', { name: 'Account' }))

      await screen.findByRole('menu')

      expect(screen.queryByText('Set your name')).toBeNull()
    })

    it('leaves the name row out on a read-only tab', async () => {
      render(<AvatarMenu name={null} />)
      await userEvent.click(screen.getByRole('button', { name: 'Account' }))

      await screen.findByRole('menu')

      expect(screen.queryByText('Set your name')).toBeNull()
    })
  })

  it('shows Keyboard shortcuts disabled until its action registers', async () => {
    render(<AvatarMenu name="Eric Le" source="git" />)

    await userEvent.click(screen.getByRole('button', { name: /Eric Le/ }))

    expect(
      await screen.findByRole('menuitem', { name: /Keyboard shortcuts/ }),
    ).toHaveAttribute('aria-disabled', 'true')
  })
})
