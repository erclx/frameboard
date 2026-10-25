import { describe, expect, it } from 'vitest'

import { agentFolder } from './state'

describe('agentFolder', () => {
  it('names the folder holding a .frameboard board', () => {
    expect(agentFolder('/home/dev/acme/.frameboard')).toBe('/home/dev/acme')
  })

  it('names a --root board by its own folder', () => {
    expect(agentFolder('/home/dev/boards/acme')).toBe('/home/dev/boards/acme')
  })

  it('names the root folder for a .frameboard made there', () => {
    expect(agentFolder('/.frameboard')).toBe('/')
  })

  it('reads past a trailing slash', () => {
    expect(agentFolder('/home/dev/acme/.frameboard/')).toBe('/home/dev/acme')
  })

  it('keeps spaces in a folder name', () => {
    expect(agentFolder('/home/dev/My Designs/.frameboard')).toBe(
      '/home/dev/My Designs',
    )
  })
})
