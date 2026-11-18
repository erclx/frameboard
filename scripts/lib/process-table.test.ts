import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { parseStat, processTable } from './process-table.ts'

describe('parseStat', () => {
  it('should read the parent pid and the start in ticks', () => {
    const line =
      '4242 (sleep) S 4100 4242 4100 0 -1 4194304 90 0 0 0 0 0 0 0 20 0 1 0 803624 5545984 222'

    expect(parseStat(line)).toEqual({
      pid: 4242,
      ppid: 4100,
      started: '803624',
    })
  })

  it('should read past a command name holding spaces and parentheses', () => {
    const line =
      '77 (a) (b c) R 12 77 12 0 -1 4194304 90 0 0 0 0 0 0 0 20 0 1 0 9001 5545984 222'

    expect(parseStat(line)).toEqual({ pid: 77, ppid: 12, started: '9001' })
  })

  it('should give nothing for a line with no command name', () => {
    expect(parseStat('77 R 12')).toBeUndefined()
  })

  it('should give nothing for a line cut short of the start field', () => {
    expect(parseStat('77 (sleep) S 12 77')).toBeUndefined()
  })
})

describe('processTable', () => {
  // Boot-relative, since `ps` lstart moves when the clock steps.
  it.runIf(process.platform === 'linux')(
    'should give this process the start the kernel counts from boot',
    () => {
      const raw = readFileSync('/proc/self/stat', 'utf8')
      const fields = raw.slice(raw.lastIndexOf(')') + 2).split(' ')

      const row = processTable('linux').get(process.pid)

      expect(row).toEqual({ ppid: process.ppid, started: fields[19] })
    },
  )

  it('should list this process under its parent from ps elsewhere', () => {
    const row = processTable('darwin').get(process.pid)

    expect(row?.ppid).toBe(process.ppid)
    expect(row?.started).toMatch(/\d{4}$/)
  })
})
