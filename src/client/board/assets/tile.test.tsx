import '../../styles.css'

import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { liveStore } from '@/client/live/store'
import type { AssetFile, AssetWriteResult } from '@/shared/records/assets'

import CLIP from '../../../../test/fixtures/boards/basic/marketing/assets/clip.webm?url'
import { FilesView } from './files'
import { Thumbnail } from './tile'
import type { AssetWrites } from './upload'

const LAKE: AssetFile = {
  path: 'lake.jpg',
  kind: 'image',
  size: 2_000,
  frames: 1,
}
const TOKYO: AssetFile = {
  path: 'tokyo.jpg',
  kind: 'image',
  size: 2_000,
  frames: 0,
}

/** Writes that answer as the server would and keep each call, so a test reads what the view sent. */
function fakeWrites(frames: string[] = ['studio/home/hero']) {
  const sent: unknown[][] = []
  const done = (path: string): Promise<AssetWriteResult> =>
    Promise.resolve({ path, frames: [] })
  const writes: AssetWrites = {
    rename: async (...args) => {
      sent.push(['rename', ...args])
      return done(args[1])
    },
    replace: async (...args) => {
      sent.push(['replace', args[0], args[1], args[2].name])
      return done(args[1])
    },
    remove: async (...args) => {
      sent.push(['remove', ...args])
      return done(args[1])
    },
    frames: async () => frames,
  }
  return { writes, sent }
}

function renderFiles(writes: AssetWrites, files: AssetFile[] = [LAKE, TOKYO]) {
  return render(
    <FilesView
      project="studio"
      load={async () => ({ files })}
      writes={writes}
    />,
  )
}

async function tileButton(path: string) {
  return screen.findByRole('button', {
    name: new RegExp(`Copy path of ${path}`),
  })
}

async function rightClick(path: string) {
  await userEvent.pointer({
    keys: '[MouseRight]',
    target: await tileButton(path),
  })
  return screen.findByRole('menu')
}

type User = ReturnType<typeof userEvent.setup>

/** Opens the tile's menu from its ⋯, which shows once the tile is focused. */
async function openMoreByPointer(user: User, path: string) {
  ;(await tileButton(path)).focus()
  await user.click(screen.getByRole('button', { name: `Actions for ${path}` }))
  return screen.findByRole('menu')
}

async function openMoreByEnter(user: User, path: string) {
  ;(await tileButton(path)).focus()
  await user.tab()
  await user.keyboard('{Enter}')
  return screen.findByRole('menu')
}

/** Picks a row and waits out the menu's close, whose focus return runs last. */
async function pickByPointer(user: User, menu: HTMLElement, name: string) {
  await user.click(within(menu).getByRole('menuitem', { name }))
  await menuGone()
}

async function pickByEnter(user: User, menu: HTMLElement, name: string) {
  within(menu).getByRole('menuitem', { name }).focus()
  await user.keyboard('{Enter}')
  await menuGone()
}

/** Reads past a modal's hiding, so a menu still closing behind the confirm counts as open. */
async function menuGone() {
  await waitFor(() =>
    expect(screen.queryByRole('menu', { hidden: true })).toBeNull(),
  )
}

function confirmButton(name: 'Cancel' | 'Delete') {
  return screen.findByRole('button', { name })
}

function itemNames(menu: HTMLElement): string[] {
  return within(menu)
    .getAllByRole('menuitem')
    .map((item) => item.textContent ?? '')
}

describe('an asset tile menu in a writing tab', () => {
  beforeEach(() => {
    act(() => liveStore.setState({ canWrite: true }))
  })

  afterEach(() => {
    act(() => liveStore.setState({ canWrite: false, board: null }))
  })

  it('opens from a right-click with every entry, counting the frames using it', async () => {
    renderFiles(fakeWrites().writes)

    const menu = await rightClick('lake.jpg')

    expect(itemNames(menu)).toEqual([
      'Place on canvas',
      'Copy pathclick',
      'Show 1 frame using it',
      'Rename',
      'Replace file…',
      'Delete',
    ])
  })

  it('opens from the ⋯ button by keyboard and gives focus back to the tile on Escape', async () => {
    const user = userEvent.setup()
    renderFiles(fakeWrites().writes)
    const tile = await tileButton('lake.jpg')
    tile.focus()

    await user.tab()
    expect(
      screen.getByRole('button', { name: 'Actions for lake.jpg' }),
    ).toHaveFocus()
    await user.keyboard('{Enter}')
    await screen.findByRole('menu')
    await user.keyboard('{Escape}')

    await waitFor(() => expect(tile).toHaveFocus())
  })

  it('greys Show frames using it for a file no frame uses', async () => {
    renderFiles(fakeWrites().writes)

    const menu = await rightClick('tokyo.jpg')

    expect(
      within(menu).getByRole('menuitem', { name: 'No frames use it' }),
    ).toHaveAttribute('aria-disabled', 'true')
  })

  it('lists the frames using the file by page and frame', async () => {
    const user = userEvent.setup()
    renderFiles(fakeWrites(['studio/home/hero', 'studio/pricing/card']).writes)

    await user.click(
      within(await rightClick('lake.jpg')).getByRole('menuitem', {
        name: 'Show 1 frame using it',
      }),
    )

    // The popover fades in, so its rows read hidden until the fade settles.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'home / hero' })).toBeVisible(),
    )
    expect(screen.getByRole('button', { name: 'pricing / card' })).toBeVisible()
  })

  it('renames the stem in place and keeps the extension', async () => {
    const user = userEvent.setup()
    const { writes, sent } = fakeWrites()
    renderFiles(writes)

    await user.click(
      within(await rightClick('lake.jpg')).getByRole('menuitem', {
        name: 'Rename',
      }),
    )
    const field = screen.getByRole('textbox', { name: 'Rename lake.jpg' })
    expect(field).toHaveValue('lake')
    await user.keyboard('shore{Enter}')

    expect(sent).toEqual([['rename', 'studio', 'lake.jpg', 'shore.jpg']])
  })

  it('cancels a rename on Escape and sends nothing', async () => {
    const user = userEvent.setup()
    const { writes, sent } = fakeWrites()
    renderFiles(writes)

    await user.click(
      within(await rightClick('lake.jpg')).getByRole('menuitem', {
        name: 'Rename',
      }),
    )
    await user.keyboard('shore{Escape}')

    expect(sent).toEqual([])
    expect(await tileButton('lake.jpg')).toBeVisible()
  })

  it('asks before deleting a file a frame uses, naming the frame', async () => {
    const user = userEvent.setup()
    const { writes, sent } = fakeWrites()
    renderFiles(writes)

    await user.click(
      within(await rightClick('lake.jpg')).getByRole('menuitem', {
        name: 'Delete',
      }),
    )
    const dialog = await screen.findByRole('dialog', {
      name: 'Delete lake.jpg?',
    })
    expect(dialog).toHaveTextContent('Its link in home / hero breaks')
    expect(sent).toEqual([])
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))

    expect(sent).toEqual([['remove', 'studio', 'lake.jpg']])
  })

  it('keeps the file when the confirm is cancelled', async () => {
    const user = userEvent.setup()
    const { writes, sent } = fakeWrites()
    renderFiles(writes)

    await user.click(
      within(await rightClick('lake.jpg')).getByRole('menuitem', {
        name: 'Delete',
      }),
    )
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Cancel',
      }),
    )

    expect(sent).toEqual([])
  })

  it('deletes a file no frame uses without asking', async () => {
    const user = userEvent.setup()
    const { writes, sent } = fakeWrites([])
    renderFiles(writes)

    await user.click(
      within(await rightClick('tokyo.jpg')).getByRole('menuitem', {
        name: 'Delete',
      }),
    )

    await waitFor(() =>
      expect(sent).toEqual([['remove', 'studio', 'tokyo.jpg']]),
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('replaces the file with the one picked and reloads its thumbnail', async () => {
    const user = userEvent.setup()
    const { writes, sent } = fakeWrites()
    const { container } = renderFiles(writes)
    const click = vi
      .spyOn(HTMLInputElement.prototype, 'click')
      .mockImplementation(() => {})

    await user.click(
      within(await rightClick('lake.jpg')).getByRole('menuitem', {
        name: 'Replace file…',
      }),
    )
    await user.upload(
      screen.getByLabelText('Choose a file to replace it with'),
      new File(['new'], 'sunset.jpg', { type: 'image/jpeg' }),
    )

    await waitFor(() =>
      expect(sent).toEqual([['replace', 'studio', 'lake.jpg', 'sunset.jpg']]),
    )
    await waitFor(() =>
      expect(
        container.querySelector('img[src$="lake.jpg?v=2000-1"]'),
      ).not.toBeNull(),
    )
    click.mockRestore()
  })

  it('loads the thumbnail afresh when an undo brings back bytes of another size', async () => {
    const user = userEvent.setup()
    let files: AssetFile[] = [LAKE]
    const { container } = render(
      <FilesView
        project="studio"
        load={async () => ({ files })}
        writes={fakeWrites().writes}
      />,
    )
    const click = vi
      .spyOn(HTMLInputElement.prototype, 'click')
      .mockImplementation(() => {})
    await user.click(
      within(await rightClick('lake.jpg')).getByRole('menuitem', {
        name: 'Replace file…',
      }),
    )
    files = [{ ...LAKE, size: 5_000 }]
    await user.upload(
      screen.getByLabelText('Choose a file to replace it with'),
      new File(['new'], 'sunset.jpg', { type: 'image/jpeg' }),
    )
    await waitFor(() =>
      expect(
        container.querySelector('img[src$="lake.jpg?v=5000-1"]'),
      ).not.toBeNull(),
    )

    files = [LAKE]
    act(() => liveStore.setState({ board: { root: '/board', projects: [] } }))

    await waitFor(() =>
      expect(
        container.querySelector('img[src$="lake.jpg?v=2000-1"]'),
      ).not.toBeNull(),
    )
    click.mockRestore()
  })

  it('rings the tile while the menu its ⋯ opened is open', async () => {
    const user = userEvent.setup()
    renderFiles(fakeWrites().writes)
    const tile = await tileButton('lake.jpg')
    tile.focus()

    await user.tab()
    await user.keyboard('{Enter}')
    await screen.findByRole('menu')

    expect(getComputedStyle(tile).boxShadow).not.toBe('none')
  })
})

describe('focus in what an asset tile menu opens', () => {
  beforeEach(() => {
    act(() => liveStore.setState({ canWrite: true }))
  })

  afterEach(() => {
    act(() => liveStore.setState({ canWrite: false, board: null }))
  })

  it('lands on Cancel when Delete is picked from the ⋯ menu by pointer', async () => {
    const user = userEvent.setup()
    renderFiles(fakeWrites().writes)

    const menu = await openMoreByPointer(user, 'lake.jpg')
    await pickByPointer(user, menu, 'Delete')

    expect(await confirmButton('Cancel')).toHaveFocus()
  })

  it('lands on Cancel when Delete is picked from the ⋯ menu by Enter', async () => {
    const user = userEvent.setup()
    renderFiles(fakeWrites().writes)

    const menu = await openMoreByEnter(user, 'lake.jpg')
    await pickByEnter(user, menu, 'Delete')

    expect(await confirmButton('Cancel')).toHaveFocus()
  })

  it('lands on Cancel when Delete is picked from a right-click', async () => {
    const user = userEvent.setup()
    renderFiles(fakeWrites().writes)

    await pickByPointer(user, await rightClick('lake.jpg'), 'Delete')

    expect(await confirmButton('Cancel')).toHaveFocus()
  })

  it('lands on Cancel when the frames read answers after the menu has closed', async () => {
    const user = userEvent.setup()
    const { writes } = fakeWrites()
    let answer: (frames: string[]) => void = () => {}
    const read = new Promise<string[]>((resolve) => {
      answer = resolve
    })
    renderFiles({ ...writes, frames: () => read })

    const menu = await openMoreByEnter(user, 'lake.jpg')
    await pickByEnter(user, menu, 'Delete')
    answer(['studio/home/hero'])

    const cancel = await confirmButton('Cancel')
    await waitFor(() => expect(cancel).toHaveFocus())
  })

  it('cycles Cancel and Delete on Tab and Shift+Tab', async () => {
    const user = userEvent.setup()
    renderFiles(fakeWrites().writes)
    const menu = await openMoreByEnter(user, 'lake.jpg')
    await pickByEnter(user, menu, 'Delete')

    const cancel = await confirmButton('Cancel')
    const remove = await confirmButton('Delete')
    await waitFor(() => expect(cancel).toHaveFocus())

    // Base UI's focus guard at each end moves the focus on a frame later.
    await user.tab()
    await waitFor(() => expect(remove).toHaveFocus())
    await user.tab()
    await waitFor(() => expect(cancel).toHaveFocus())
    await user.tab({ shift: true })
    await waitFor(() => expect(remove).toHaveFocus())
  })

  it('stays in the frames popover opened from the ⋯ menu', async () => {
    const user = userEvent.setup()
    renderFiles(fakeWrites().writes)

    const menu = await openMoreByEnter(user, 'lake.jpg')
    await pickByEnter(user, menu, 'Show 1 frame using it')

    const popover = await screen.findByRole('dialog', {
      name: 'Frames using it',
    })
    expect(popover.contains(document.activeElement)).toBe(true)
  })

  it('returns to the tile when a press on the ⋯ closes its menu', async () => {
    const user = userEvent.setup()
    renderFiles(fakeWrites().writes)
    await openMoreByPointer(user, 'lake.jpg')

    await user.click(
      screen.getByRole('button', {
        name: 'Actions for lake.jpg',
        hidden: true,
      }),
    )
    await menuGone()

    expect(await tileButton('lake.jpg')).toHaveFocus()
  })
})

describe('focus once what an asset tile menu opened closes', () => {
  beforeEach(() => {
    act(() => liveStore.setState({ canWrite: true }))
  })

  afterEach(() => {
    act(() => liveStore.setState({ canWrite: false, board: null }))
  })

  /** A project whose Delete takes the file out of the list read after it. */
  function renderDeletable(paths: string[]) {
    let files: AssetFile[] = paths.map((path) => ({ ...LAKE, path }))
    const { writes } = fakeWrites()
    const drop = (path: string) => {
      files = files.filter((file) => file.path !== path)
    }
    render(
      <FilesView
        project="studio"
        load={async () => ({ files })}
        writes={{
          ...writes,
          remove: async (project, path) => {
            drop(path)
            return writes.remove(project, path)
          },
        }}
      />,
    )
    return { drop }
  }

  async function askDeleteFromMore(user: User, path: string) {
    await pickByEnter(user, await openMoreByEnter(user, path), 'Delete')
    await screen.findByRole('dialog')
  }

  async function deleteFile(user: User, path: string) {
    await askDeleteFromMore(user, path)
    await user.click(await confirmButton('Delete'))
    await dialogGone()
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: new RegExp(path) }),
      ).toBeNull(),
    )
  }

  async function dialogGone() {
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { hidden: true })).toBeNull(),
    )
  }

  it('returns to the tile on Escape from a confirm the ⋯ menu opened', async () => {
    const user = userEvent.setup()
    renderFiles(fakeWrites().writes)
    await askDeleteFromMore(user, 'lake.jpg')

    await user.keyboard('{Escape}')
    await dialogGone()

    expect(await tileButton('lake.jpg')).toHaveFocus()
  })

  it('returns to the tile on Cancel in a confirm the ⋯ menu opened', async () => {
    const user = userEvent.setup()
    renderFiles(fakeWrites().writes)
    await askDeleteFromMore(user, 'lake.jpg')

    await user.click(await confirmButton('Cancel'))
    await dialogGone()

    expect(await tileButton('lake.jpg')).toHaveFocus()
  })

  it('returns to the tile on Escape from a confirm a right-click opened', async () => {
    const user = userEvent.setup()
    renderFiles(fakeWrites().writes)
    await pickByPointer(user, await rightClick('lake.jpg'), 'Delete')
    await screen.findByRole('dialog')

    await user.keyboard('{Escape}')
    await dialogGone()

    expect(await tileButton('lake.jpg')).toHaveFocus()
  })

  it('returns to the tile on Cancel in a confirm a right-click opened', async () => {
    const user = userEvent.setup()
    renderFiles(fakeWrites().writes)
    await pickByPointer(user, await rightClick('lake.jpg'), 'Delete')

    await user.click(await confirmButton('Cancel'))
    await dialogGone()

    expect(await tileButton('lake.jpg')).toHaveFocus()
  })

  it('moves to the next tile after Delete', async () => {
    const user = userEvent.setup()
    renderDeletable(['lake.jpg', 'reef.jpg', 'tokyo.jpg'])

    await deleteFile(user, 'reef.jpg')

    expect(await tileButton('tokyo.jpg')).toHaveFocus()
  })

  it('moves to the previous tile after Delete on the last one', async () => {
    const user = userEvent.setup()
    renderDeletable(['lake.jpg', 'tokyo.jpg'])

    await deleteFile(user, 'tokyo.jpg')

    expect(await tileButton('lake.jpg')).toHaveFocus()
  })

  it('moves to Add files after Delete on the only file', async () => {
    const user = userEvent.setup()
    renderDeletable(['lake.jpg'])

    await deleteFile(user, 'lake.jpg')

    expect(screen.getByRole('button', { name: 'Add files' })).toHaveFocus()
  })

  it('moves to Add files rather than another folder after Delete on a folder’s only file', async () => {
    const user = userEvent.setup()
    renderDeletable(['lake.jpg', 'team/ana.jpg'])

    await deleteFile(user, 'team/ana.jpg')

    expect(screen.getByRole('button', { name: 'Add files' })).toHaveFocus()
  })

  it('moves to Add files when the file went away while the confirm was open', async () => {
    const user = userEvent.setup()
    const { drop } = renderDeletable(['lake.jpg', 'tokyo.jpg'])
    await askDeleteFromMore(user, 'lake.jpg')
    drop('lake.jpg')
    act(() => liveStore.setState({ board: { root: '/board', projects: [] } }))
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: /lake\.jpg/, hidden: true }),
      ).toBeNull(),
    )

    await user.keyboard('{Escape}')
    await dialogGone()

    expect(screen.getByRole('button', { name: 'Add files' })).toHaveFocus()
  })

  it('returns to the tile on Escape from the frames popover the ⋯ menu opened', async () => {
    const user = userEvent.setup()
    renderFiles(fakeWrites().writes)
    const menu = await openMoreByEnter(user, 'lake.jpg')
    await pickByEnter(user, menu, 'Show 1 frame using it')

    await user.keyboard('{Escape}')
    await dialogGone()

    expect(await tileButton('lake.jpg')).toHaveFocus()
  })

  it('rests on the next tile when the Delete is refused and its tile stays', async () => {
    const user = userEvent.setup()
    const { writes } = fakeWrites()
    const refused: AssetWrites['remove'] = () =>
      Promise.reject(new Error('The file is locked.'))
    renderFiles({ ...writes, remove: refused })
    await askDeleteFromMore(user, 'lake.jpg')

    await user.click(await confirmButton('Delete'))
    await dialogGone()

    expect(await tileButton('lake.jpg')).toBeVisible()
    expect(await tileButton('tokyo.jpg')).toHaveFocus()
  })
})

describe('an asset tile menu in a view-only tab', () => {
  it('offers Copy path alone and draws no ⋯ button', async () => {
    renderFiles(fakeWrites().writes)

    const menu = await rightClick('lake.jpg')

    expect(itemNames(menu)).toEqual(['Copy pathclick'])
    expect(
      screen.queryByRole('button', {
        name: 'Actions for lake.jpg',
        hidden: true,
      }),
    ).not.toBeInTheDocument()
  })
})

const VIDEO: AssetFile = { path: 'clip.webm', kind: 'video', size: 14_000 }

/** A one second VP8 clip, 160 by 90. */
function renderVideo(url: string, playing = false) {
  return render(
    <Thumbnail project="studio" file={VIDEO} url={url} playing={playing} />,
  )
}

function videoOf(container: HTMLElement): HTMLVideoElement {
  const video = container.querySelector('video')
  if (!video) throw new Error('the tile draws no video')
  return video
}

describe('Thumbnail for a video', () => {
  it('shows the first frame with the length once its metadata loads', async () => {
    const { container } = renderVideo(CLIP)

    expect(await screen.findByText('0:01')).toBeInTheDocument()
    expect(videoOf(container).videoWidth).toBe(160)
    expect(videoOf(container).paused).toBe(true)
  })

  it('loads metadata alone until its tile is hovered or focused', () => {
    const { container } = renderVideo(CLIP)

    expect(videoOf(container).preload).toBe('metadata')
  })

  it('plays muted while its tile is hovered or focused', async () => {
    const { container, rerender } = renderVideo(CLIP)
    await screen.findByText('0:01')

    rerender(
      <Thumbnail project="studio" file={VIDEO} url={CLIP} playing={true} />,
    )

    await waitFor(() => expect(videoOf(container).paused).toBe(false))
    expect(videoOf(container).muted).toBe(true)
  })

  it('pauses and rewinds once its tile is left', async () => {
    const { container, rerender } = renderVideo(CLIP, true)
    await waitFor(() => expect(videoOf(container).paused).toBe(false))

    rerender(<Thumbnail project="studio" file={VIDEO} url={CLIP} />)

    await waitFor(() => expect(videoOf(container).paused).toBe(true))
    expect(videoOf(container).currentTime).toBe(0)
  })

  it('says the codec cannot play when the file does not decode', async () => {
    const { container } = renderVideo('data:video/mp4,not-a-video')

    expect(await screen.findByText("Can't play this codec")).toBeInTheDocument()
    expect(container.querySelector('video')).toBeNull()
  })
})

describe('Thumbnail for an image', () => {
  it('leaves the drag to its tile, so a press on the picture starts no image drag', () => {
    const { container } = render(
      <Thumbnail
        project="studio"
        file={{ path: 'lake.jpg', kind: 'image', size: 2_000 }}
        url="data:image/gif;base64,R0lGODlhAQABAAAAACw="
      />,
    )

    expect(container.querySelector('img')?.draggable).toBe(false)
  })
})
