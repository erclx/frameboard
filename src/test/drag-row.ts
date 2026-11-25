const nextFrame = () =>
  new Promise((resolve) => requestAnimationFrame(() => resolve(null)))

/** Drags one row onto an edge of another through the native events the drag library listens to. */
export async function dragOnto(
  source: HTMLElement,
  target: HTMLElement,
  edge: 'top' | 'bottom',
): Promise<void> {
  const dataTransfer = new DataTransfer()
  const from = source.getBoundingClientRect()
  const to = target.getBoundingClientRect()
  const at = {
    clientX: to.left + to.width / 2,
    clientY: edge === 'top' ? to.top + 2 : to.bottom - 2,
  }
  const fire = (element: HTMLElement, type: string, point: object) =>
    element.dispatchEvent(
      new DragEvent(type, {
        bubbles: true,
        cancelable: true,
        dataTransfer,
        ...point,
      }),
    )
  fire(source, 'dragstart', {
    clientX: from.left + 4,
    clientY: from.top + 4,
  })
  await nextFrame()
  fire(target, 'dragenter', at)
  fire(target, 'dragover', at)
  await nextFrame()
  fire(target, 'drop', at)
  await nextFrame()
}
