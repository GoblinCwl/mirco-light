/** Scroll only overflowing track names; leave short labels and touch input alone. */
export function mountTrackMarquee(player: any, root: HTMLElement, signal: AbortSignal) {
  const panel = root.querySelector<HTMLElement>(".art-settings")
  if (!panel) return
  let frame = 0
  let current: HTMLElement | undefined
  let labels: { element: HTMLElement; distance: number }[] = []
  const stop = () => {
    cancelAnimationFrame(frame)
    frame = 0
    current = undefined
    for (const { element } of labels) {
      element.scrollLeft = 0
      element.classList.remove("is-track-scrolling")
    }
    labels = []
  }
  panel.addEventListener(
    "pointerover",
    (event) => {
      if (event.pointerType === "touch" || !(event.target instanceof Element)) return
      const row = event.target.closest<HTMLElement>(".art-setting-item")
      if (row === current) return
      stop()
      if (!row?.classList.contains("quartz-track-item")) return
      labels = Array.from(
        row.querySelectorAll<HTMLElement>(
          ".art-setting-item-left-text,.art-setting-item-right-tooltip",
        ),
      )
        .map((element) => ({ element, distance: element.scrollWidth - element.clientWidth }))
        .filter(({ distance }) => distance > 1)
      if (!labels.length) return
      current = row
      for (const { element } of labels) element.classList.add("is-track-scrolling")
      let started: number | undefined
      const animate = (now: number) => {
        started ??= now
        for (const { element, distance } of labels) {
          element.scrollLeft = trackScrollOffset(now - started, distance)
        }
        frame = requestAnimationFrame(animate)
      }
      frame = requestAnimationFrame(animate)
    },
    { signal },
  )
  panel.addEventListener(
    "pointerout",
    (event) => {
      if (
        current &&
        (!(event.relatedTarget instanceof Node) || !current.contains(event.relatedTarget))
      )
        stop()
    },
    { signal },
  )
  const visibility = (open: boolean) => {
    if (!open) stop()
  }
  player.on("setting", visibility)
  let active: Element | null = panel.querySelector(".art-setting-panel.art-current")
  const observer = new MutationObserver(() => {
    const next = panel.querySelector(".art-setting-panel.art-current")
    if (next !== active || (current && !panel.contains(current))) {
      active = next
      stop()
    }
  })
  observer.observe(panel, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["class"],
  })
  signal.addEventListener(
    "abort",
    () => {
      stop()
      observer.disconnect()
      player.off("setting", visibility)
    },
    { once: true },
  )
}

export function trackScrollOffset(elapsed: number, distance: number) {
  const travel = (distance / 28) * 1000
  const phase = elapsed % (travel * 2 + 1800)
  return phase < 800
    ? 0
    : phase < 800 + travel
      ? ((phase - 800) / travel) * distance
      : phase < 1800 + travel
        ? distance
        : distance * (1 - (phase - 1800 - travel) / travel)
}
