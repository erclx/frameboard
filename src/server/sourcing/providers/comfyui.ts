import { runWorkflow } from '../comfyui/client'
import { BUNDLED_WORKFLOW, fillWorkflow } from '../comfyui/workflow'
import type { ImageProvider } from './provider'

/**
 * A ComfyUI server the developer runs, its "key" the address it listens at.
 * It charges nothing and runs the bundled FLUX.2 klein 4B workflow unless the
 * request carries the developer's own.
 */
export const comfyui: ImageProvider = {
  name: 'comfyui',
  model: 'flux-2-klein-4b-fp8',
  keyEnv: 'FRAMEBOARD_COMFYUI_URL',
  sizeFor: (asked) => asked,
  priceFor: () => 0,
  generate({ prompt, size, key, seed, workflow }, send) {
    const graph = fillWorkflow(workflow?.graph ?? BUNDLED_WORKFLOW, {
      prompt,
      ...size,
      seed,
    })
    return runWorkflow(key, graph, send)
  },
}
