/** The bytes a fake run answers as its GLB, starting with glTF's own magic. */
export const FAKE_GLB = new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0])

/** The leading bytes of a PNG, which a picture check reads in place of its name. */
export const PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
])

/**
 * A fake ComfyUI that takes an upload as `stored`, finishes every prompt at
 * once, and serves one GLB. It records each request as `METHOD path` and each
 * prompt posted. `history` replaces the finished run's history entry, as for
 * a run failing in a node.
 */
export function comfyModelServer({
  stored = 'axe.png',
  history,
}: { stored?: string; history?: unknown } = {}) {
  const asked: string[] = []
  const prompts: unknown[] = []
  const send = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    asked.push(`${init?.method ?? 'GET'} ${url.pathname}`)
    if (url.pathname.endsWith('/upload/image')) {
      return Response.json({ name: stored, subfolder: '', type: 'input' })
    }
    if (url.pathname.endsWith('/prompt')) {
      prompts.push(JSON.parse(String(init?.body)))
      return Response.json({ prompt_id: 'p1' })
    }
    if (url.pathname.endsWith('/history/p1')) {
      return Response.json({
        p1: history ?? {
          status: { status_str: 'success', completed: true },
          outputs: {
            '322': {
              '3d': [
                {
                  filename: 'frameboard_00001_.glb',
                  subfolder: '3d',
                  type: 'output',
                },
              ],
            },
          },
        },
      })
    }
    if (url.pathname.endsWith('/view')) {
      return new Response(FAKE_GLB, {
        headers: { 'content-type': 'model/gltf-binary' },
      })
    }
    return new Response('not found', { status: 404 })
  }) as typeof fetch
  return { send, asked, prompts }
}
