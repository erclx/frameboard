import { describe, expect, it } from 'vitest'

import {
  elementFrameName,
  folderName,
  isReservedPageName,
  isValidName,
  namesCollide,
  nextFreeName,
  titledFolder,
} from './names'

describe('isValidName', () => {
  it.each(['hero', 'Hero', 'page-1', 'v2.final', 'a_b', '0', 'a'.repeat(64)])(
    'accepts %j',
    (name) => {
      expect(isValidName(name)).toBe(true)
    },
  )

  it.each(['', '-hero', '.hidden', '_x', 'two words', 'a/b', 'a'.repeat(65)])(
    'rejects %j',
    (name) => {
      expect(isValidName(name)).toBe(false)
    },
  )
})

describe('isReservedPageName', () => {
  it('reserves assets in any case', () => {
    expect(isReservedPageName('Assets')).toBe(true)
  })

  it('leaves other names free', () => {
    expect(isReservedPageName('assets-2')).toBe(false)
  })
})

describe('namesCollide', () => {
  it('matches case-insensitively', () => {
    expect(namesCollide('Hero', 'hero')).toBe(true)
  })
})

describe('nextFreeName', () => {
  it('returns the base when free', () => {
    expect(nextFreeName('hero', ['about'])).toBe('hero')
  })

  it('takes the first free suffix', () => {
    expect(nextFreeName('hero', ['hero', 'hero-2'])).toBe('hero-3')
  })

  it('counts a name differing only in case as taken', () => {
    expect(nextFreeName('hero', ['Hero'])).toBe('hero-2')
  })
})

describe('folderName', () => {
  it('turns a space into a dash and lowers the case', () => {
    expect(folderName('Manual drive')).toBe('manual-drive')
  })

  it('folds a run of refused characters into one dash and drops a trailing one', () => {
    expect(folderName('Drive 38 basics!')).toBe('drive-38-basics')
  })

  it('drops a leading dot', () => {
    expect(folderName('.hidden plans')).toBe('hidden-plans')
  })

  it('cuts a long title to the name limit', () => {
    const folder = folderName('a'.repeat(80))
    expect(folder).toBe('a'.repeat(64))
  })

  it('does not end on a dash where the cut lands on one', () => {
    expect(folderName(`${'a'.repeat(63)} b`)).toBe('a'.repeat(63))
  })

  it('is empty for a title holding nothing a name may', () => {
    expect(folderName('!!!')).toBe('')
  })

  it.each([
    ['Lịch trình · Look and feel', 'lich-trinh-look-and-feel'],
    ['Li\u0323ch tri\u0300nh', 'lich-trinh'],
    ['café crème', 'cafe-creme'],
    ['đường', 'duong'],
    ['Đà Nẵng', 'da-nang'],
  ])('folds the marked letters of %j to %j', (title, folder) => {
    expect(folderName(title)).toBe(folder)
  })

  it.each(['\u0301\u0323', '東京'])(
    'is empty for %j, which holds no base letter',
    (title) => {
      expect(folderName(title)).toBe('')
    },
  )

  it.each([
    'Manual drive',
    'Drive 38 basics!',
    '.hidden plans',
    '_x',
    'a'.repeat(80),
  ])('makes a valid name from %j', (title) => {
    expect(isValidName(folderName(title))).toBe(true)
  })
})

describe('titledFolder', () => {
  it('takes the name made from the title', () => {
    expect(titledFolder('untitled', 'Manual drive', ['untitled'])).toBe(
      'manual-drive',
    )
  })

  it('takes the next free name when another project holds it', () => {
    expect(titledFolder('untitled', 'Studio', ['untitled', 'studio'])).toBe(
      'studio-2',
    )
  })

  it('takes the next free name when another title folds to the same one', () => {
    expect(titledFolder('untitled', 'Lịch', ['untitled', 'lich'])).toBe(
      'lich-2',
    )
  })

  it('keeps the folder a title already names, in any case', () => {
    expect(titledFolder('Studio', 'studio', ['Studio', 'studio-2'])).toBe(
      'Studio',
    )
  })

  it('keeps the folder when the title names none', () => {
    expect(titledFolder('studio', '!!!', ['studio'])).toBe('studio')
  })

  it('cuts a taken name at the length limit back to a free one that fits', () => {
    const long = 'a'.repeat(64)

    expect(titledFolder('untitled', 'a'.repeat(80), ['untitled', long])).toBe(
      'a'.repeat(63),
    )
  })

  it('keeps every landing folder a valid name when the cut names are taken too', () => {
    const taken = ['untitled', 'a'.repeat(64), 'a'.repeat(63)]

    expect(isValidName(titledFolder('untitled', 'a'.repeat(80), taken))).toBe(
      true,
    )
  })
})

describe('elementFrameName', () => {
  it.each([
    ['Talk to the assistant', 'button', 'talk-to-the-assistant'],
    ['hero.png', 'img', 'hero-png'],
    ['Nút Đăng ký', 'button', 'nut-dang-ky'],
    ['日本語', 'p', 'p'],
    [null, 'model-viewer', 'model-viewer'],
  ])('names the frame %s on a %s makes %s', (name, tagName, frame) => {
    expect(elementFrameName(name, tagName)).toBe(frame)
  })

  it('leaves room under the name limit for the suffix a taken name grows', () => {
    const name = elementFrameName('long '.repeat(30), 'p')

    expect(isValidName(nextFreeName(name, [name]))).toBe(true)
  })
})
