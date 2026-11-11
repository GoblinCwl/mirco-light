// Scroll only the shared directory viewport, leaving the document in place.
export async function revealDirectoryEntry(scope: HTMLElement, signal?: AbortSignal): Promise<boolean> {
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  if (!scope.isConnected || signal?.aborted) return false
  const desktop = window.matchMedia("(min-width: 801px)").matches
  const scroller = scope.closest<HTMLElement>(desktop ? ".directory-scroll" : ".explorer-content")
  const entry = scope.querySelector<HTMLElement>('[aria-current="page"], a.active, .folder-container.active')
  if (!scroller || !entry || !entry.checkVisibility()) return false
  // Expanded details and the mobile drawer must finish moving before measuring.
  const transitions = scroller.getAnimations({ subtree: true }).filter(animation => animation instanceof CSSTransition &&
    ["grid-template-rows", "transform", "visibility", "content-visibility", "margin-top"].includes(animation.transitionProperty))
  await Promise.allSettled(transitions.map(animation => animation.finished))
  if (!scope.isConnected || signal?.aborted || !entry.isConnected || !entry.checkVisibility()) return false
  const bounds = entry.getBoundingClientRect(), viewport = scroller.getBoundingClientRect()
  const top = viewport.top + scroller.clientTop, left = viewport.left + scroller.clientLeft
  let targetTop = scroller.scrollTop, targetLeft = scroller.scrollLeft
  if (bounds.top < top + 8 || bounds.bottom > top + scroller.clientHeight - 8) {
    targetTop += bounds.top - top - Math.max(8, (scroller.clientHeight - bounds.height) / 2)
  }
  if (bounds.left < left + 8) targetLeft += bounds.left - left - 8
  else if (bounds.width < scroller.clientWidth - 16 && bounds.right > left + scroller.clientWidth - 8) {
    targetLeft += bounds.right - left - scroller.clientWidth + 8
  }
  scroller.scrollTo({
    top: targetTop, left: targetLeft,
    behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
  })
  return true
}
