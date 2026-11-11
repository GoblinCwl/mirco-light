import { setRouteDirectoryOpen } from "./directoryPersistence"

// Animate only explicit disclosure clicks. Route updates settle immediately.
export function createDirectoryDetailsMotion(signal: AbortSignal) {
  const running = new Map<HTMLDetailsElement, Animation>()
  const stop = (details: HTMLDetailsElement) => {
    const current = running.get(details)
    running.delete(details); current?.cancel()
  }
  signal.addEventListener("abort", () => { for (const details of running.keys()) stop(details) }, { once: true })
  return (details: HTMLDetailsElement, open: boolean, animate = false) => {
    const target = String(open), hadMotion = running.has(details)
    if (details.dataset.directoryExpanded === target && (hadMotion || details.open === open)) return
    details.dataset.directoryExpanded = target
    details.querySelector(":scope > summary > button")?.setAttribute("aria-expanded", target)
    if (details.open === open && !hadMotion) return
    if (!animate || signal.aborted || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      stop(details); setRouteDirectoryOpen(details, open, false); return
    }
    const list = details.querySelector<HTMLElement>(":scope > ul")
    if (!list) { stop(details); setRouteDirectoryOpen(details, open, false); return }
    const from = details.open ? list.getBoundingClientRect().height : 0
    stop(details)
    delete details.dataset.routeUpdating
    details.open = true
    const to = open ? list.scrollHeight : 0
    const animation = list.animate([{ height: `${from}px`, overflow: "hidden" }, { height: `${to}px`, overflow: "hidden" }], { duration: 300, easing: "ease-in-out", fill: "both" })
    running.set(details, animation)
    void animation.finished.then(() => {
      if (running.get(details) !== animation || signal.aborted) return
      details.open = open; running.delete(details); animation.cancel()
    }).catch(() => {})
  }
}
