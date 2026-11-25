import '../../../styles.css'

import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { ImageResult, ModelResult } from '@/shared/records/sourcing'

import { ImagePicture, ModelPicture } from './picture'

function image(overrides: Partial<ImageResult> = {}): ImageResult {
  return {
    number: 1,
    id: 'a1',
    title: 'Guitar',
    creator: null,
    creatorUrl: null,
    license: 'cc0',
    licenseVersion: null,
    licenseUrl: null,
    attribution: null,
    landingUrl: 'https://commons.wikimedia.org/w/index.php?curid=1',
    url: 'https://upload.example.org/Guitar_1.svg',
    thumbnail: 'https://api.example.org/thumb/',
    width: 100,
    height: 100,
    ...overrides,
  }
}

function model(overrides: Partial<ModelResult> = {}): ModelResult {
  return {
    number: 1,
    id: 'sofa_02',
    name: 'Sofa 02',
    authors: [],
    categories: [],
    tags: [],
    license: 'cc0',
    landingUrl: 'https://polyhaven.com/a/sofa_02',
    thumbnail: 'https://cdn.example.org/sofa_02.png',
    polycount: null,
    dimensionsMm: null,
    sizes: ['1k'],
    downloadCount: 1,
    ...overrides,
  }
}

function shown(): HTMLImageElement {
  return screen.getByRole('presentation')
}

describe('a result picture', () => {
  it('draws the thumbnail first, sending no referrer', () => {
    render(<ImagePicture result={image()} />)

    expect(shown()).toHaveAttribute('src', 'https://api.example.org/thumb/')
    expect(shown()).toHaveAttribute('referrerpolicy', 'no-referrer')
  })

  it('draws an SVG result from its original once its thumbnail fails', () => {
    render(<ImagePicture result={image()} />)

    fireEvent.error(shown())

    expect(shown()).toHaveAttribute(
      'src',
      'https://upload.example.org/Guitar_1.svg',
    )
  })

  it('names the file type and the source once the original fails too', () => {
    render(<ImagePicture result={image()} />)

    fireEvent.error(shown())
    fireEvent.error(shown())

    expect(screen.queryByRole('presentation')).not.toBeInTheDocument()
    expect(screen.getByText('SVG')).toBeVisible()
    expect(screen.getByText('Wikimedia')).toBeVisible()
  })

  it('never loads the original of a photo whose thumbnail fails', () => {
    render(
      <ImagePicture
        result={image({
          url: 'https://upload.example.org/Guitar_1.jpg?size=full',
        })}
      />,
    )

    fireEvent.error(shown())

    expect(screen.queryByRole('presentation')).not.toBeInTheDocument()
    expect(screen.getByText('JPG')).toBeVisible()
  })

  it.each([
    ['a data link', 'data:image/svg+xml,<svg/>'],
    ['a javascript link', 'javascript:alert(1)'],
    ['no link at all', 'not a url'],
  ])('loads nothing from %s', (_, link) => {
    render(<ImagePicture result={image({ thumbnail: link, url: link })} />)

    expect(screen.queryByRole('presentation')).not.toBeInTheDocument()
    expect(screen.getByText('Image')).toBeVisible()
  })

  it('names Openverse where the result has no page of its own', () => {
    render(
      <ImagePicture result={image({ landingUrl: null, thumbnail: null })} />,
    )

    fireEvent.error(shown())

    expect(screen.getByText('Openverse')).toBeVisible()
  })

  it('names a model that has no thumbnail as a GLB from Poly Haven', () => {
    render(<ModelPicture result={model({ thumbnail: null })} />)

    expect(screen.queryByRole('presentation')).not.toBeInTheDocument()
    expect(screen.getByText('GLB')).toBeVisible()
    expect(screen.getByText('Poly Haven')).toBeVisible()
  })

  it('starts over for another result', () => {
    const { rerender } = render(<ImagePicture result={image()} />)
    fireEvent.error(shown())

    rerender(
      <ImagePicture
        result={image({ thumbnail: 'https://api.example.org/other/' })}
      />,
    )

    expect(shown()).toHaveAttribute('src', 'https://api.example.org/other/')
  })
})
