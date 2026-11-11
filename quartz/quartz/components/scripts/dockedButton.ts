/** Shared mobile panel launcher: drag, edge docking, position memory and click suppression. */
export function setupDockedButton(launch: HTMLButtonElement, compact: MediaQueryList, signal: AbortSignal, positionKey: () => string) {
  const positions = new Map<string, { x: number; y: number }>()
  const readPosition = () => {
    const key = positionKey()
    if (!positions.has(key)) try {
      const saved = JSON.parse(localStorage.getItem(key) || "null")
      if (saved && [saved.x, saved.y].every(n => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1)) positions.set(key, saved)
    } catch { /* Saving a button position is optional. */ }
    return positions.get(key)
  }
  let position = readPosition(), suppressClick = false
  const place = () => {
    const label=launch.textContent?.trim()
    if(label){launch.setAttribute("aria-label",label);launch.title=label}
    if (!compact.matches || !position) {
      for (const property of ["left", "right", "top", "bottom"]) launch.style.removeProperty(property)
      return
    }
    const width = launch.offsetWidth, height = launch.offsetHeight
    // Hidden buttons measure 0: positioning from that width pins them past
    // the right edge and briefly squeezes the label when they become visible.
    if (!width || !height) return
    const x = drag?.moved ? position.x : position.x < .5 ? 0 : 1
    launch.style.left = drag?.moved ? `${Math.max(12, Math.min(innerWidth - width - 12, x * innerWidth - width / 2))}px` : x === 0 ? "12px" : "auto"
    launch.style.top = `${Math.max(12, Math.min(innerHeight - height - 12, position.y * innerHeight - height / 2))}px`
    launch.style.right = !drag?.moved && x === 1 ? "12px" : "auto"; launch.style.bottom = "auto"
  }
  let drag: { id: number; x: number; y: number; left: number; top: number; moved: boolean } | undefined
  launch.addEventListener("pointerdown", event => {
    if (!compact.matches || event.button !== 0) return
    suppressClick = false
    const box = launch.getBoundingClientRect()
    launch.setAttribute("data-dragging", "")
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: box.left, top: box.top, moved: false }
    launch.setPointerCapture(event.pointerId)
  }, { signal })
  launch.addEventListener("pointermove", event => {
    if (!drag || drag.id !== event.pointerId) return
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y
    if (!drag.moved && Math.hypot(dx, dy) < 6) return
    drag.moved = true
    const left = Math.max(12, Math.min(innerWidth - launch.offsetWidth - 12, drag.left + dx))
    const top = Math.max(12, Math.min(innerHeight - launch.offsetHeight - 12, drag.top + dy))
    position = { x: (left + launch.offsetWidth / 2) / innerWidth, y: (top + launch.offsetHeight / 2) / innerHeight }
    place()
  }, { signal })
  const finishDrag = (event: PointerEvent) => {
    if (!drag || drag.id !== event.pointerId) return
    suppressClick = drag.moved
    if (drag.moved && position) {
      position = { ...position, x: position.x < .5 ? 0 : 1 }
      const key = positionKey(); positions.set(key, position)
      try { localStorage.setItem(key, JSON.stringify(position)) } catch {}
    }
    if (launch.hasPointerCapture(event.pointerId)) launch.releasePointerCapture(event.pointerId)
    drag = undefined
    launch.removeAttribute("data-dragging")
    place()
  }
  launch.addEventListener("pointerup", finishDrag, { signal }); launch.addEventListener("pointercancel", finishDrag, { signal })
  launch.addEventListener("click", event => { if (suppressClick) { event.preventDefault(); event.stopImmediatePropagation(); suppressClick = false } }, { capture: true, signal })
  const restore = () => { position = readPosition(); place() }
  const resize = new ResizeObserver(place); resize.observe(launch)
  addEventListener("resize", place, { signal })
  compact.addEventListener("change", place, { signal })
  signal.addEventListener("abort", () => resize.disconnect(), { once: true })
  place()
  return { place, restore }
}
