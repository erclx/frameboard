import '../../../styles.css'

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { TooltipProvider } from '@/client/components/ui/tooltip'
import type { ModelReading, ModelStage } from '@/shared/frame-bridge/model'
import { LOOK_MARKER, RENDERED_HASH } from '@/shared/theme'
import { BRIDGE } from '@/test/frame-bridge'

import { request } from '../../bridge/channel'
import { useLiveModel } from '../../element/model'
import type { ElementKey } from '../../selection'
import { ModelSection } from './model'

const UNSTAGED: ModelReading['staged'] = {
  'camera-orbit': null,
  'min-camera-orbit': null,
  'max-camera-orbit': null,
  'camera-target': null,
  'field-of-view': null,
  'max-field-of-view': null,
  orientation: null,
  scale: null,
  'animation-name': null,
  autoplay: null,
}

function readingOf(over: Partial<ModelReading> = {}): ModelReading {
  return {
    src: '../assets/phone.glb',
    loaded: true,
    clips: ['Idle', 'Run'],
    orbit: { theta: 0, phi: 75 },
    camera: { distance: 3, view: 30 },
    bounds: { center: { x: 0, y: 0, z: 0 }, size: { x: 1, y: 1, z: 1 } },
    staged: UNSTAGED,
    ...over,
  }
}

/** Renders the section over `reading`, answering each write as `written` and listing what was staged and written. */
function renderSection(
  reading: ModelReading,
  { written = true, disabled = false } = {},
) {
  const staged: ModelStage[][] = []
  const writes: ModelStage[][] = []
  render(
    <TooltipProvider>
      <ModelSection
        model={{ reading, stage: (changes) => staged.push([...changes]) }}
        disabled={disabled}
        write={(changes) => {
          writes.push([...changes])
          return Promise.resolve(written)
        }}
      />
    </TooltipProvider>,
  )
  return { staged, writes }
}

async function typeInto(name: string, value: string) {
  const field = screen.getByRole('textbox', { name })
  await userEvent.clear(field)
  await userEvent.type(field, `${value}{Enter}`)
}

describe('ModelSection', () => {
  it("names the model's file and shows what the viewer states", () => {
    renderSection(
      readingOf({
        staged: {
          ...UNSTAGED,
          'camera-orbit': '-40deg 60deg auto',
          orientation: '10deg 20deg 30deg',
          scale: '2 2 2',
          'animation-name': 'Run',
          autoplay: '',
        },
      }),
    )

    expect(screen.getByText('phone.glb')).toBeVisible()
    expect(screen.getByRole('textbox', { name: 'Camera around' })).toHaveValue(
      '-40°',
    )
    expect(screen.getByRole('textbox', { name: 'Camera height' })).toHaveValue(
      '60°',
    )
    expect(screen.getByRole('textbox', { name: 'Rotation X' })).toHaveValue(
      '20°',
    )
    expect(screen.getByRole('textbox', { name: 'Scale' })).toHaveValue('2')
    expect(screen.getByRole('button', { name: 'Clip' })).toHaveTextContent(
      'Run',
    )
    expect(screen.getByRole('switch', { name: 'Play on load' })).toBeChecked()
  })

  it('names the double-click that turns the model by hand', () => {
    renderSection(readingOf())

    const hint = screen.getByText(/the model to turn it by hand/)

    expect(hint).toBeVisible()
    expect(hint).toHaveTextContent(
      'Double-click the model to turn it by hand. Esc leaves.',
    )
  })

  it('counts the clips the file holds', () => {
    renderSection(readingOf())

    expect(screen.getByText('Clip in this file · 2')).toBeVisible()
  })

  it('drops the count for a model with no clip', () => {
    renderSection(readingOf({ clips: [] }))

    expect(screen.getByText('Clip in this file')).toBeVisible()
  })

  it('writes an angle as the orbit with its reach beside it', async () => {
    const { writes } = renderSection(readingOf())

    await typeInto('Camera around', '-40')

    expect(writes).toEqual([
      [
        { name: 'camera-orbit', value: '-40deg 75deg auto' },
        { name: 'max-camera-orbit', value: 'auto auto auto' },
      ],
    ])
  })

  it('shows an angle on the live viewer before it is written', async () => {
    const { staged } = renderSection(readingOf())

    await typeInto('Camera height', '30')

    expect(staged.at(0)).toEqual([
      { name: 'camera-orbit', value: '0deg 30deg auto' },
      { name: 'max-camera-orbit', value: 'auto auto auto' },
    ])
  })

  it.each([
    ['Rotation X', '20', { name: 'orientation', value: '0deg 20deg 0deg' }],
    ['Rotation Y', '-30', { name: 'orientation', value: '0deg 0deg -30deg' }],
    ['Rotation Z', '45', { name: 'orientation', value: '45deg 0deg 0deg' }],
    ['Scale', '2', { name: 'scale', value: '2 2 2' }],
  ])('writes %s as its attribute', async (name, value, stage) => {
    const { writes } = renderSection(readingOf())

    await typeInto(name, value)

    expect(writes).toEqual([[stage]])
  })

  it('drops the scale from the file at 1', async () => {
    const { writes } = renderSection(
      readingOf({ staged: { ...UNSTAGED, scale: '2 2 2' } }),
    )

    await typeInto('Scale', '1')

    expect(writes).toEqual([[{ name: 'scale', value: null }]])
  })

  it('writes nothing for a value left where it was', async () => {
    const { writes } = renderSection(readingOf())

    await typeInto('Camera around', '0')

    expect(writes).toEqual([])
  })

  it('puts back what the viewer stated when a write is refused', async () => {
    const { staged } = renderSection(
      readingOf({ staged: { ...UNSTAGED, scale: '2 2 2' } }),
      { written: false },
    )

    await typeInto('Scale', '3')

    await waitFor(() =>
      expect(staged.at(-1)).toEqual([{ name: 'scale', value: '2 2 2' }]),
    )
  })

  it('writes the clip picked as the animation name', async () => {
    const { writes } = renderSection(readingOf())

    await userEvent.click(screen.getByRole('button', { name: 'Clip' }))
    await userEvent.click(
      await screen.findByRole('menuitemradio', { name: 'Run' }),
    )

    expect(writes).toEqual([[{ name: 'animation-name', value: 'Run' }]])
  })

  it('offers no clip to pick for a model that carries none', () => {
    renderSection(readingOf({ clips: [] }))

    const picker = screen.getByRole('button', { name: 'Clip' })

    expect(picker).toBeDisabled()
    expect(picker).toHaveTextContent('None')
  })

  it('states autoplay when its switch turns on', async () => {
    const { writes } = renderSection(readingOf())

    await userEvent.click(screen.getByRole('switch', { name: 'Play on load' }))

    expect(writes).toEqual([[{ name: 'autoplay', value: '' }]])
  })

  it('drops autoplay when its switch turns off', async () => {
    const { writes } = renderSection(
      readingOf({ staged: { ...UNSTAGED, autoplay: '' } }),
    )

    await userEvent.click(screen.getByRole('switch', { name: 'Play on load' }))

    expect(writes).toEqual([[{ name: 'autoplay', value: null }]])
  })

  it('takes no edit while the board cannot write', () => {
    renderSection(readingOf(), { disabled: true })

    expect(
      screen.getByRole('textbox', { name: 'Camera around' }),
    ).toBeDisabled()
    expect(screen.getByRole('switch', { name: 'Play on load' })).toBeDisabled()
  })
})

describe('ModelSection over a live frame', () => {
  const FRAME = 'studio/home/hero'
  const HASH = 'a'.repeat(64)
  /** The viewer's index, after html, head, and body, the injected style skipped. */
  const VIEWER: ElementKey = { frame: FRAME, index: 3, hash: HASH }

  let root: HTMLElement | null = null

  afterEach(() => {
    root?.remove()
    root = null
  })

  /** Mounts a live frame box whose page holds one viewer no script drew, as the canvas draws one. */
  async function mountFrame(): Promise<HTMLIFrameElement> {
    root = document.createElement('div')
    root.dataset.frame = FRAME
    const iframe = document.createElement('iframe')
    root.append(iframe)
    document.body.append(root)
    await new Promise<void>((resolve) => {
      iframe.addEventListener('load', () => resolve(), { once: true })
      iframe.srcdoc = `<!doctype html><html><head><style ${LOOK_MARKER} ${RENDERED_HASH}="${HASH}"></style>${BRIDGE}</head><body><model-viewer src="../assets/phone.glb"></model-viewer></body></html>`
    })
    // Its reply follows the hash the bridge announced as it started.
    await request(iframe, 'element-box', { index: 0, hash: '' })
    return iframe
  }

  function Section({ write }: { write: (changes: ModelStage[]) => void }) {
    const model = useLiveModel(VIEWER)
    return model ? (
      <TooltipProvider>
        <ModelSection
          model={model}
          disabled={false}
          write={(changes) => {
            write([...changes])
            return Promise.resolve(true)
          }}
        />
      </TooltipProvider>
    ) : null
  }

  it('states a typed value on the live viewer and reads it back', async () => {
    const iframe = await mountFrame()
    const write = vi.fn()
    render(<Section write={write} />)
    await screen.findByRole('textbox', { name: 'Scale' })

    await typeInto('Scale', '2')

    await waitFor(() =>
      expect(
        iframe.contentDocument
          ?.querySelector('model-viewer')
          ?.getAttribute('scale'),
      ).toBe('2 2 2'),
    )
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: 'Scale' })).toHaveValue('2'),
    )
    expect(write).toHaveBeenCalledWith([{ name: 'scale', value: '2 2 2' }])
  })
})
