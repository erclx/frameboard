import { readFile } from 'node:fs/promises'

import { FrameboardError } from '@/shared/errors'

import bundled from './flux2-klein.json' with { type: 'json' }
import pixal3d from './pixal3d.json' with { type: 'json' }

/** One node of a workflow in ComfyUI's API format, as its own export writes it. */
export interface WorkflowNode {
  class_type: string
  inputs: Record<string, unknown>
}

/** A workflow in ComfyUI's API format, keyed by node id. */
export type Workflow = Record<string, WorkflowNode>

/** What a workflow makes, which sets the placeholder it has to carry. */
export type WorkflowKind = 'image' | 'model'

/** What an image run fills into `{{prompt}}`, `{{width}}`, `{{height}}`, and `{{seed}}`. */
export interface WorkflowValues {
  prompt: string
  width: number
  height: number
  seed: number
}

/** What a model run fills into `{{image}}`, the uploaded picture's name on the server, and `{{seed}}`. */
export interface ModelWorkflowValues {
  image: string
  seed: number
}

/** FLUX.2 klein 4B's distilled text-to-image graph, the one a run takes without `--workflow`. */
export const BUNDLED_WORKFLOW: Workflow = bundled

/**
 * Pixal3D's image-to-model graph at web size, 100,000 triangles and 2048 px
 * textures, the one a model run takes without `--workflow`.
 */
export const BUNDLED_MODEL_WORKFLOW: Workflow = pixal3d

const REQUIRED: Record<
  WorkflowKind,
  { name: string; holds: string; input: string }
> = {
  image: { name: '{{prompt}}', holds: 'the prompt asked', input: 'text input' },
  model: {
    name: '{{image}}',
    holds: 'the picture given',
    input: 'LoadImage node’s image input',
  },
}

const PLACEHOLDER = /\{\{(prompt|image|width|height|seed)\}\}/g

/**
 * The workflow with each placeholder the values name filled, leaving any
 * other as written. A string that is one number placeholder alone becomes
 * that number, since ComfyUI refuses a width sent as text, and a placeholder
 * inside longer text is filled as text.
 */
export function fillWorkflow(
  workflow: Workflow,
  values: WorkflowValues | ModelWorkflowValues,
): Workflow {
  const known: Record<string, string | number> = { ...values }
  const fill = (value: unknown): unknown => {
    if (typeof value === 'string') {
      const whole = /^\{\{(width|height|seed)\}\}$/.exec(value)?.[1]
      if (whole !== undefined && whole in known) return known[whole]
      return value.replace(PLACEHOLDER, (placeholder, name: string) =>
        name in known ? String(known[name]) : placeholder,
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
 * The value as an API-format workflow carrying the placeholder its kind
 * requires, `{{prompt}}` for an image and `{{image}}` for a model, refusing
 * `usage` otherwise, so a run never sends a graph that ignores its input.
 */
export function checkWorkflow(
  value: unknown,
  name: string,
  kind: WorkflowKind = 'image',
): Workflow {
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
  const required = REQUIRED[kind]
  if (!JSON.stringify(value).includes(required.name)) {
    throw new FrameboardError(
      'usage',
      `${name} holds no ${required.name}, so ${required.holds} would never reach it. Put ${required.name} in the ${required.input} that takes it.`,
      { workflow: name },
    )
  }
  return value as Workflow
}

/** Reads and checks a workflow file before any request, refusing `usage` for one that is absent, not JSON, or no workflow of its kind. */
export async function readWorkflow(
  path: string,
  kind: WorkflowKind = 'image',
): Promise<Workflow> {
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
  return checkWorkflow(parsed, path, kind)
}
