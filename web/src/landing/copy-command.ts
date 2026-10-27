const RESET_MS = 2000

/**
 * Turns each `[data-copy]` block into a copy button for the command it holds.
 * The button ships hidden, so with scripts off the command stays plain,
 * selectable text and no dead control shows.
 */
export function wireCopyCommands(root: ParentNode = document): void {
  for (const block of root.querySelectorAll<HTMLElement>('[data-copy]')) {
    const command = block.querySelector('code')?.textContent ?? ''
    const button = block.querySelector('button')
    const status = block.querySelector<HTMLElement>('[role="status"]')
    if (!button || !command) continue
    button.hidden = false
    let timer: ReturnType<typeof setTimeout> | undefined
    button.addEventListener('click', async () => {
      let label = 'Copied'
      try {
        await navigator.clipboard.writeText(command)
      } catch {
        selectText(block.querySelector('code'))
        label = /mac/i.test(navigator.platform) ? 'Press Cmd+C' : 'Press Ctrl+C'
      }
      button.textContent = label
      if (status)
        status.textContent = label === 'Copied' ? 'Command copied' : ''
      clearTimeout(timer)
      timer = setTimeout(() => {
        button.textContent = 'Copy'
        if (status) status.textContent = ''
      }, RESET_MS)
    })
  }
}

function selectText(node: Element | null): void {
  const selection = window.getSelection()
  if (!node || !selection) return
  const range = document.createRange()
  range.selectNodeContents(node)
  selection.removeAllRanges()
  selection.addRange(range)
}
