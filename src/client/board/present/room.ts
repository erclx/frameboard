import { type RefObject, useLayoutEffect, useState } from 'react'

/** An element's size, read before paint and on every resize, the window's until the first read. */
export function useRoom(element: RefObject<HTMLElement | null>) {
  const [room, setRoom] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  })
  useLayoutEffect(() => {
    const target = element.current
    if (!target) return
    const read = () =>
      setRoom({ width: target.clientWidth, height: target.clientHeight })
    read()
    const observer = new ResizeObserver(read)
    observer.observe(target)
    return () => observer.disconnect()
  }, [element])
  return room
}
