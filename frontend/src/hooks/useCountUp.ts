import { useEffect, useRef, useState } from "react"

/**
 * Animates a number from 0 to `target` using requestAnimationFrame.
 * The animation starts only once the ref element enters the viewport.
 *
 * @param target  Final numeric value to count to.
 * @param duration  Animation duration in milliseconds (default 2000).
 * @returns  [current value, ref to attach to the trigger element]
 */
export function useCountUp(target: number, duration = 2000): [number, React.RefObject<HTMLDivElement | null>] {
  const [current, setCurrent] = useState(0)
  const ref = useRef<HTMLDivElement | null>(null)
  const rafId = useRef<number | null>(null)
  const startTime = useRef<number | null>(null)
  const hasStarted = useRef(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    function easeOutQuart(t: number): number {
      return 1 - Math.pow(1 - t, 4)
    }

    function tick(timestamp: number) {
      if (startTime.current === null) startTime.current = timestamp
      const elapsed = timestamp - startTime.current
      const progress = Math.min(elapsed / duration, 1)
      setCurrent(Math.round(easeOutQuart(progress) * target))
      if (progress < 1) {
        rafId.current = requestAnimationFrame(tick)
      }
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !hasStarted.current) {
          hasStarted.current = true
          startTime.current = null
          rafId.current = requestAnimationFrame(tick)
        }
      },
      { threshold: 0.3 }
    )

    observer.observe(node)

    return () => {
      observer.disconnect()
      if (rafId.current !== null) cancelAnimationFrame(rafId.current)
    }
  }, [target, duration])

  return [current, ref]
}
