import { hookReply } from './hook-reply'

// The write hook's entry, bundled to dist/hook.js beside the CLI. It exits 0
// on every path, since Claude Code lets a write stand whatever the hook does
// and a nonzero exit would only print an error the agent cannot act on.
let input = ''
try {
  for await (const chunk of process.stdin) input += String(chunk)
} catch {
  input = ''
}
const reply = hookReply(input)
if (reply !== null) process.stdout.write(`${reply}\n`)
