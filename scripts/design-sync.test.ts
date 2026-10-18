import { describe, expect, it } from 'vitest'

import {
  classifyDrift,
  parseCarried,
  resolveCarried,
  spliceFilesSection,
  stripPicked,
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
])

describe('parseCarried', () => {
  it('should read frames from the Surfaces table alone', () => {
    const index = [
      '## Surfaces',
      '',
      '| Surface | Frames |',
      '| --- | --- |',
      '| Tokens | `02-design-system/parts`, `02-design-system/fb-base` |',
      '| Hide UI | `05-layout/picked-hide-ui` |',
      '',
      '## Files',
      '',
      '| `05-layout/resize-blue` | 1x1 | `a.png` |',
    ].join('\n')

    expect(parseCarried(index)).toEqual([
      '02-design-system/parts',
      '02-design-system/fb-base',
      '05-layout/picked-hide-ui',
    ])
  })
})

describe('resolveCarried', () => {
  it('should map a stem to a single file or a theme pair', () => {
    const { frames, missing } = resolveCarried(
      ['02-design-system/fb-base', '02-design-system/parts'],
      canvas,
    )

    expect(frames).toEqual([
      { page: '02-design-system', stem: 'fb-base', single: true },
      { page: '02-design-system', stem: 'parts', single: false },
    ])
    expect(missing).toEqual([])
  })

  it('should name a stem with no file, and a pair missing a theme', () => {
    const { frames, missing } = resolveCarried(
      ['02-design-system/tokens', '05-layout/gone'],
      canvas,
    )

    expect(frames).toEqual([])
    expect(missing).toEqual(['02-design-system/tokens', '05-layout/gone'])
  })
})

describe('uncarriedPicked', () => {
  it('should report an uncarried picked frame once and stay silent on a rejected one', () => {
    expect(uncarriedPicked(['05-layout/picked-hide-ui'], canvas)).toEqual([
      '05-layout/picked-new',
    ])
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

describe('classifyDrift', () => {
  it('should split changed from missing, comparing after the marker cut', () => {
    const marked = '<p>a</p><i style="color:#ffd400"></i>'
    const drift = classifyDrift(
      new Map([
        ['x/a.html', marked],
        ['x/b.html', '<p>b2</p>'],
        ['x/c.html', '<p>c</p>'],
      ]),
      new Map([
        ['x/a.html', '<p>a</p>'],
        ['x/b.html', '<p>b</p>'],
      ]),
    )

    expect(drift).toEqual({ changed: ['x/b.html'], missing: ['x/c.html'] })
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
