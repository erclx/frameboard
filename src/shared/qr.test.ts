import { describe, expect, it } from 'vitest'

import { qrModules } from './qr'

function rows(modules: boolean[][]): string[] {
  return modules.map((row) => row.map((dark) => (dark ? '#' : '.')).join(''))
}

describe('qrModules', () => {
  it('encodes a fixed link as the code the qrcode package draws for it in byte mode at level M', () => {
    const modules = qrModules('http://10.0.0.2:4400/v/k3P9xQ/')

    expect(rows(modules)).toEqual([
      '#######.#.#.####.###..#######',
      '#.....#.#..#.#..#.#.#.#.....#',
      '#.###.#..#.#....#.#.#.#.###.#',
      '#.###.#.#.##..##.#..#.#.###.#',
      '#.###.#...##..#.#..#..#.###.#',
      '#.....#..#..##.###.##.#.....#',
      '#######.#.#.#.#.#.#.#.#######',
      '........#.#.#..#####.........',
      '#.##.###.#.#.#.#.#....#..#.##',
      '...###.#..##.###...#..#.#...#',
      '#....##.######..#...#..##.##.',
      '#.####..#.#.....#.##..####..#',
      '...##.#.......##....##...##..',
      '#.####...#....#.#####.##...##',
      '#..#..#.##...#.##..#.#...####',
      '.##.##.##.##..#.#.#..##.#..#.',
      '#..#.####.###.###.......#..#.',
      '.#.###..####..#.###..#....##.',
      '#...#.##.#.######.#..#...##..',
      '...#.#.##.##.##..##...#.#.#..',
      '.###.#####.#.##.###########..',
      '........#......###.##...#####',
      '#######.##..#.##.#.##.#.##.#.',
      '#.....#.#.##.###...##...##...',
      '#.###.#....#........#######.#',
      '#.###.#.####.....##.#..##.##.',
      '#.###.#.#...###......#......#',
      '#.....#....####.#..####.#..#.',
      '#######.##.#.###....#.##.#.#.',
    ])
  })

  it('takes the smallest version, 21 modules a side, for two bytes', () => {
    expect(qrModules('hi')).toHaveLength(21)
  })

  it('takes version 7, 45 modules a side and the first carrying version bits, for a long link', () => {
    const link = `http://192.168.1.24:51234/v/${'a'.repeat(22)}/frames/${'p'.repeat(40)}/page/frame.html`

    expect(qrModules(link)).toHaveLength(45)
  })

  it('refuses a text no version holds', () => {
    expect(() => qrModules('x'.repeat(3000))).toThrow(/holds no text/)
  })
})
