import { readFile } from 'node:fs/promises'

import { FrameboardError } from '@/shared/errors'

import bundled from './flux2-klein.json'

/** One node of a workflow in ComfyUI's API format, as its own export writes it. */
export interface WorkflowNode {
  class_type: string
  inputs: Record<string, unknown>
}

/** A workflow in ComfyUI's API format, keyed by node id. */
export type Workflow = Record<string, WorkflowNode>

/** What a run fills into a workflow's `{{prompt}}`, `{{width}}`, `{{height}}`, and `{{seed}}`. */
export interface WorkflowValues {
  prompt: string
  width: number
  height: number
  seed: number
}

/** FLUX.2 klein 4B's distilled text-to-image graph, the one a run takes without `--workflow`. */
export const BUNDLED_WORKFLOW: Workflow = bundled

const PLACEHOLDER = /\{\{(prompt|width|height|seed)\}\}/g

/**
 * The workflow with each placeholder filled. A string that is one number
 * placeholder alone becomes that number, since ComfyUI refuses a width sent
 * as text, and a placeholder inside longer text is filled as text.
 */
export function fillWorkflow(
  workflow: Workflow,
  values: WorkflowValues,
): Workflow {
  const fill = (value: unknown): unknown => {
    if (typeof value === 'string') {
      const whole = /^\{\{(width|height|seed)\}\}$/.exec(value)
      if (whole?.[1] === 'width') return values.width
      if (whole?.[1] === 'height') return values.height
      if (whole?.[1] === 'seed') return values.seed
      return value.replace(PLACEHOLDER, (_, name: keyof WorkflowValues) =>
        String(values[name]),
      )
    }
    if (Array.isArray(value)) return value.map(fill)
    if (typeof value === 'object' && value !== null) {
      return Object.fromEntries(
        Object.entries(value).map(([key, each]) => [key, fill(each)]),
      )
    }
    return value
  }
  return Object.fromEntries(
    Object.entries(workflow).map(([id, node]) => [
      id,
      { ...node, inputs: fill(node.inputs) as Record<string, unknown> },
    ]),
  )
}

/**
 * The value as an API-format workflow carrying `{{prompt}}`, refusing `usage`
 * otherwise, so a run never sends a graph that ignores the prompt asked.
 */
export function checkWorkflow(value: unknown, name: string): Workflow {
  const nodes =
    typeof value === 'object' && value !== null && !Array.isArray(value)
      ? Object.values(value)
      : []
  const isApiFormat =
    nodes.length > 0 &&
    nodes.every(
      (node) =>
        typeof node === 'object' &&
        node !== null &&
        'class_type' in node &&
        typeof node.class_type === 'string' &&
        'inputs' in node &&
        typeof node.inputs === 'object' &&
        node.inputs !== null,
    )
  if (!isApiFormat) {
    throw new FrameboardError(
      'usage',
      `${name} is not a ComfyUI workflow in the API format. Export it from ComfyUI with File, Export (API).`,
      { workflow: name },
    )
  }
  if (!JSON.stringify(value).includes('{{prompt}}')) {
    throw new FrameboardError(
      'usage',
      `${name} holds no {{prompt}}, so the prompt asked would never reach it. Put {{prompt}} in the text input that takes it.`,
      { workflow: name },
    )
  }
  return value as Workflow
}

/** Reads and checks a workflow file before any request, refusing `usage` for one that is absent, not JSON, or no workflow. */
export async function readWorkflow(path: string): Promise<Workflow> {
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch {
    throw new FrameboardError('usage', `No workflow file at ${path}.`, {
      workflow: path,
    })
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new FrameboardError('usage', `${path} is not JSON.`, {
      workflow: path,
    })
  }
  return checkWorkflow(parsed, path)
}
