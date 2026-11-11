// Fade the clipped edges when the retained directory viewport is scrolled.
export function setupDirectoryFrame(root: HTMLElement, signal: AbortSignal) {
  const desktop = matchMedia("(min-width: 801px)")
  let frame = 0
  const position = () => {
    frame = 0
    if (!root.isConnected || signal.aborted) return
    const surface = root.closest<HTMLElement>(".directory-frame")
    surface?.toggleAttribute("data-scrolled-x", desktop.matches && root.scrollLeft > 0)
    surface?.toggleAttribute("data-scrolled-y", desktop.matches && root.scrollTop > 0)

  }
  const schedule = () => { if (!frame) frame = requestAnimationFrame(position) }
  const resized = new ResizeObserver(schedule)
  resized.observe(root)
  for (const group of root.querySelectorAll<HTMLElement>(".explorer, .directory-tools-desktop")) resized.observe(group)
  const changed = new MutationObserver(schedule)
  changed.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "open"] })
  root.addEventListener("scroll", schedule, { signal, passive: true })
  window.addEventListener("scroll", schedule, { signal, passive: true })
  window.addEventListener("resize", schedule, { signal, passive: true })
  document.addEventListener("directory-ready", schedule, { signal })
  desktop.addEventListener("change", schedule, { signal })
  signal.addEventListener("abort", () => { cancelAnimationFrame(frame); resized.disconnect(); changed.disconnect() }, { once: true })
  schedule()
}
