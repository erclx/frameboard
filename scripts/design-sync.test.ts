import { describe, expect, it } from 'vitest'

import {
  classifyDrift,
  parseCarried,
  referenceName,
  resolveCarried,
  spliceFilesSection,
  stripPicked,
  toReference,
  uncarriedPicked,
} from './lib/design-reference.ts'

const canvas = new Map([
  [
    '02-design-system',
    ['fb-base.html', 'parts-dark.html', 'parts-light.html', 'tokens-dark.html'],
  ],
  [
    '05-layout',
    [
      'picked-hide-ui-dark.html',
      'picked-hide-ui-light.html',
      'picked-new-dark.html',
      'picked-new-light.html',
      'resize-blue-dark.html',
      'resize-blue-light.html',
    ],
  ],
  ['12-canvas', ['hide-ui-dark.html', 'hide-ui-light.html']],
])

describe('parseCarried', () => {
  it('should read frames from the Surfaces table alone', () => {
    const index = [
      '## Surfaces',
      '',
      '| Surface | Folder | Frames |',
      '| --- | --- | --- |',
      '| Tokens | `design-system` | `02-design-system/parts`, `02-design-system/fb-base` |',
      '| Hide UI | `shell` | `05-layout/picked-hide-ui` |',
      '',
      '## Files',
      '',
      '| `05-layout/resize-blue` | 1x1 | `a.png` |',
    ].join('\n')

    expect(parseCarried(index)).toEqual([
      { ref: '02-design-system/parts', folder: 'design-system' },
      { ref: '02-design-system/fb-base', folder: 'design-system' },
      { ref: '05-layout/picked-hide-ui', folder: 'shell' },
    ])
  })

  it('should read the name an as override gives', () => {
    const index = [
      '## Surfaces',
      '',
      '| Surface | Folder | Frames |',
      '| --- | --- | --- |',
      '| Menus | `menus` | `14-overlays/menu-toast` as `toast`, `14-overlays/context-menus` |',
    ].join('\n')

    expect(parseCarried(index)).toEqual([
      { ref: '14-overlays/menu-toast', folder: 'menus', name: 'toast' },
      { ref: '14-overlays/context-menus', folder: 'menus' },
    ])
  })

  it('should refuse a row with no folder, naming the row', () => {
    const index = [
      '## Surfaces',
      '',
      '| Surface | Folder | Frames |',
      '| --- | --- | --- |',
      '| Hide UI | | `05-layout/picked-hide-ui` |',
    ].join('\n')

    expect(() => parseCarried(index)).toThrow('Surfaces row "Hide UI"')
  })

  it('should refuse a row still in the two-column shape', () => {
    const index = [
      '## Surfaces',
      '',
      '| Surface | Frames |',
      '| --- | --- |',
      '| Hide UI | `05-layout/picked-hide-ui` |',
    ].join('\n')

    expect(() => parseCarried(index)).toThrow('Surfaces row "Hide UI"')
  })
})

describe('referenceName', () => {
  it('should drop the picked prefix and a leading folder name', () => {
    expect(referenceName('picked-toolbar-floating', 'toolbar')).toBe('floating')
    expect(referenceName('home-grid', 'home')).toBe('grid')
    expect(referenceName('note-place', 'notes')).toBe('note-place')
  })

  it('should keep the stem when the folder name is all of it', () => {
    expect(referenceName('palette', 'palette')).toBe('palette')
  })
})

describe('resolveCarried', () => {
  it('should map a stem to a single file or a theme pair under its folder', () => {
    const { frames, missing, clashes } = resolveCarried(
      [
        { ref: '02-design-system/fb-base', folder: 'design-system' },
        { ref: '02-design-system/parts', folder: 'design-system' },
      ],
      canvas,
    )

    expect(frames).toEqual([
      {
        page: '02-design-system',
        stem: 'fb-base',
        folder: 'design-system',
        name: 'fb-base',
        single: true,
      },
      {
        page: '02-design-system',
        stem: 'parts',
        folder: 'design-system',
        name: 'parts',
        single: false,
      },
    ])
    expect(missing).toEqual([])
    expect(clashes).toEqual([])
  })

  it('should name a stem with no file, and a pair missing a theme', () => {
    const { frames, missing } = resolveCarried(
      [
        { ref: '02-design-system/tokens', folder: 'design-system' },
        { ref: '05-layout/gone', folder: 'shell' },
      ],
      canvas,
    )

    expect(frames).toEqual([])
    expect(missing).toEqual(['02-design-system/tokens', '05-layout/gone'])
  })

  it('should report two frames that file to one reference path', () => {
    const { clashes } = resolveCarried(
      [
        { ref: '05-layout/picked-hide-ui', folder: 'shell' },
        { ref: '12-canvas/hide-ui', folder: 'shell' },
      ],
      canvas,
    )

    expect(clashes).toEqual(['shell/hide-ui'])
  })
})

describe('uncarriedPicked', () => {
  it('should report an uncarried picked frame once and stay silent on a rejected one', () => {
    expect(
      uncarriedPicked(
        [{ ref: '05-layout/picked-hide-ui', folder: 'shell' }],
        canvas,
      ),
    ).toEqual(['05-layout/picked-new'])
  })
})

describe('stripPicked', () => {
  const marker =
    '<div style="position:fixed;inset:0;box-shadow:inset 0 0 0 6px #ffd400"></div>' +
    '<div style="background:#FFD400;font:700 13px Geist">✓ Picked</div>'

  it('should cut the marker elements and keep every other byte', () => {
    const html = `<html><body>\n<p>  hi  </p>${marker}\n</body></html>`

    expect(stripPicked(html)).toBe(
      '<html><body>\n<p>  hi  </p>\n</body></html>',
    )
  })

  it('should leave a frame without a marker byte for byte', () => {
    const html = '<p style="color:red">x</p>'

    expect(stripPicked(html)).toBe(html)
  })
})

describe('toReference', () => {
  it('should point the shared kit links at the folder kit', () => {
    const html =
      '<link href="../01-kit/kit.css"><script src="../01-kit/vendor/rough.js"></script>'

    expect(toReference(html)).toBe(
      '<link href="../kit/kit.css"><script src="../kit/vendor/rough.js"></script>',
    )
  })
})

describe('classifyDrift', () => {
  it('should fail the HTML and the file set and only warn on PNG bytes', () => {
    const drift = classifyDrift(
      new Map<string, string | Uint8Array>([
        ['x/a.html', '<p>a</p>'],
        ['x/b.html', '<p>b2</p>'],
        ['x/c.png', new Uint8Array([1, 2])],
        ['x/d.png', new Uint8Array([3])],
      ]),
      new Map<string, string | Uint8Array>([
        ['x/a.html', '<p>a</p>'],
        ['x/b.html', '<p>b</p>'],
        ['x/c.png', new Uint8Array([1, 9])],
        ['x/old.png', new Uint8Array([4])],
      ]),
    )

    expect(drift).toEqual({
      changed: ['x/b.html'],
      pngDiffers: ['x/c.png'],
      missing: ['x/d.png'],
      stray: ['x/old.png'],
    })
  })
})

describe('spliceFilesSection', () => {
  it('should replace the marked block and leave the rest', () => {
    const index =
      'lead\n\n<!-- design:sync:start -->\nold\n<!-- design:sync:end -->\n\ntail\n'

    expect(
      spliceFilesSection(
        index,
        '<!-- design:sync:start -->\nnew\n<!-- design:sync:end -->',
      ),
    ).toBe(
      'lead\n\n<!-- design:sync:start -->\nnew\n<!-- design:sync:end -->\n\ntail\n',
    )
  })
})
