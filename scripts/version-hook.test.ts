import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const hook = join(
  import.meta.dirname,
  '..',
  'plugins',
  'frameboard',
  'hooks',
  'version.sh',
)

const PLUGIN = '0.23.0'
const OLDER = '0.22.0'
const NEWER = '0.24.0'

function findOnPath(name: string): string | undefined {
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    const candidate = join(dir, name)
    if (existsSync(candidate)) return candidate
  }
}

let root: string
let bin: string
let plugin: string
let project: string

// The hook runs on a PATH of linked tools only, so a developer's own global
// frameboard can never answer for the fixture.
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'version-hook-'))
  bin = join(root, 'bin')
  plugin = join(root, 'plugin')
  project = join(root, 'project')
  mkdirSync(bin)
  mkdirSync(project)
  const tools = ['bash', 'sed', 'head', 'sort', 'dirname', 'grep', 'realpath']
  for (const tool of tools) symlinkSync(findOnPath(tool)!, join(bin, tool))
  const runtime = findOnPath('bun') ?? findOnPath('node')
  symlinkSync(runtime!, join(bin, 'bun'))
  writePluginManifest(plugin, PLUGIN)
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function writePluginManifest(dir: string, version: string) {
  mkdirSync(join(dir, '.claude-plugin'), { recursive: true })
  writeFileSync(
    join(dir, '.claude-plugin', 'plugin.json'),
    JSON.stringify({ name: 'frameboard', version }, null, 2),
  )
}

function writeCli(distDir: string, version: string) {
  mkdirSync(distDir, { recursive: true })
  writeFileSync(join(distDir, 'cli.js'), `console.log('${version}')\n`)
}

function writeProjectManifest(name: string) {
  writeFileSync(
    join(project, 'package.json'),
    JSON.stringify({ name, version: '1.0.0' }, null, 2),
  )
}

function runHook(env: Record<string, string> = {}) {
  const run = spawnSync(join(bin, 'bash'), [hook], {
    env: { PATH: bin, CLAUDE_PLUGIN_ROOT: plugin, ...env },
    encoding: 'utf8',
  })
  return { status: run.status, output: run.stdout }
}

describe('version hook', () => {
  it("should name a rebuild when the checkout's own dist is stale", () => {
    writeProjectManifest('frameboard')
    writeCli(join(project, 'dist'), OLDER)

    const { status, output } = runHook({ CLAUDE_PROJECT_DIR: project })

    expect(status).toBe(0)
    expect(output).toContain(`does not match the frameboard ${OLDER}`)
    expect(output).toContain('bun run build')
    expect(output).not.toContain('Stop')
  })

  it('should name the rebuild when CLAUDE_PROJECT_DIR ends in a slash', () => {
    writeProjectManifest('frameboard')
    writeCli(join(project, 'dist'), OLDER)

    const { output } = runHook({ CLAUDE_PROJECT_DIR: `${project}/` })

    expect(output).toContain('bun run build')
    expect(output).not.toContain('Stop')
  })

  it('should name the project dependency when it is the stale install', () => {
    writeProjectManifest('some-app')
    writeCli(join(project, 'node_modules', 'frameboard', 'dist'), OLDER)

    const { status, output } = runHook({ CLAUDE_PROJECT_DIR: project })

    expect(status).toBe(0)
    expect(output).toContain('update the frameboard dependency of this project')
    expect(output).not.toContain('bun run build')
    expect(output).not.toContain('Stop')
  })

  it('should name the global install when it is the stale install', () => {
    const globalDist = join(root, 'global', 'dist')
    writeCli(globalDist, OLDER)
    symlinkSync(join(globalDist, 'cli.js'), join(bin, 'frameboard'))

    const { status, output } = runHook()

    expect(status).toBe(0)
    expect(output).toContain("update the CLI with 'npm install -g frameboard'")
    expect(output).not.toContain('Stop')
  })

  it('should name the plugin when the CLI is newer', () => {
    writeProjectManifest('frameboard')
    writeCli(join(project, 'dist'), NEWER)

    const { status, output } = runHook({ CLAUDE_PROJECT_DIR: project })

    expect(status).toBe(0)
    expect(output).toContain('update the plugin')
    expect(output).not.toContain('Stop')
  })

  it('should point to the install when no frameboard is found', () => {
    const { status, output } = runHook()

    expect(status).toBe(0)
    expect(output).toContain("Install it with 'npm install -g frameboard'")
    expect(output).not.toContain('Stop')
  })

  it('should print nothing when the CLI matches the plugin', () => {
    writeProjectManifest('frameboard')
    writeCli(join(project, 'dist'), PLUGIN)

    const { status, output } = runHook({ CLAUDE_PROJECT_DIR: project })

    expect(status).toBe(0)
    expect(output).toBe('')
  })

  it('should print nothing when the plugin has no manifest', () => {
    writeProjectManifest('frameboard')
    writeCli(join(project, 'dist'), OLDER)

    const { status, output } = runHook({
      CLAUDE_PROJECT_DIR: project,
      CLAUDE_PLUGIN_ROOT: join(root, 'empty'),
    })

    expect(status).toBe(0)
    expect(output).toBe('')
  })
})
