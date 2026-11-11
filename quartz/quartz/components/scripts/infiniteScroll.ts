/** Append another batch near the bottom, including when a short list does not fill its viewport. */
export function createInfiniteScroll(
  target: HTMLElement,
  load: () => void | Promise<void>,
  options: { root?: HTMLElement; signal: AbortSignal },
) {
  let enabled = false, busy = false, frame = 0
  const nearBottom = () => {
    if (!target.isConnected || !target.getClientRects().length) return false
    const box = target.getBoundingClientRect()
    const viewport = options.root?.getBoundingClientRect() || { top: 0, bottom: innerHeight }
    return box.bottom >= viewport.top && box.top <= viewport.bottom + 240
  }
  const check = () => {
    frame = 0
    if (options.signal.aborted || !enabled || busy || !nearBottom()) return
    busy = true
    // Callers retain their content and show a retry action if fetching fails.
    void Promise.resolve().then(load).catch(() => { enabled = false }).finally(() => {
      busy = false
      schedule()
    })
  }
  const schedule = () => {
    cancelAnimationFrame(frame)
    if (enabled && !options.signal.aborted) frame = requestAnimationFrame(check)
  }
  const observer = new IntersectionObserver(schedule, {
    root: options.root || null, rootMargin: "0px 0px 240px 0px",
  })
  observer.observe(target)
  const scroller = options.root || window
  scroller.addEventListener("scroll", schedule, { passive: true, signal: options.signal })
  window.addEventListener("resize", schedule, { passive: true, signal: options.signal })
  options.signal.addEventListener("abort", () => {
    enabled = false
    cancelAnimationFrame(frame)
    observer.disconnect()
  }, { once: true })
  return {
    setEnabled(value: boolean) {
      enabled = value
      if (value) schedule()
      else cancelAnimationFrame(frame)
    },
  }
}
