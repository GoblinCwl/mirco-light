// Directory listeners belong to the retained directory, not to an article page.
type DirectoryState = {
  cleanups: WeakMap<HTMLElement, Set<() => void>>
  routeToggles: WeakMap<HTMLDetailsElement, boolean>
  routeMotionFrames: WeakMap<HTMLDetailsElement, number>
}
const directoryKey = Symbol.for("quartz.directory.persistence")
const shared = globalThis as unknown as Record<symbol, DirectoryState>
const { cleanups, routeToggles, routeMotionFrames } = shared[directoryKey] ??= {
  cleanups: new WeakMap(), routeToggles: new WeakMap(), routeMotionFrames: new WeakMap(),
}

export function addDirectoryCleanup(scope: HTMLElement, cleanup: () => void) {
  const root = scope.closest<HTMLElement>(".directory-scroll")!
  let callbacks = cleanups.get(root)
  if (!callbacks) { callbacks = new Set(); cleanups.set(root, callbacks) }
  callbacks.add(cleanup)
}
export function disposeDirectory(root: HTMLElement) {
  for (const cleanup of cleanups.get(root) || []) cleanup()
  cleanups.delete(root)
}
export function setRouteDirectoryOpen(details: HTMLDetailsElement, open: boolean, animate = false) {
  if (details.open === open) return
  routeToggles.set(details, open)
  // Route-driven disclosures settle without height transitions.
  cancelAnimationFrame(routeMotionFrames.get(details) || 0)
  if (animate) {
    delete details.dataset.routeUpdating
    routeMotionFrames.delete(details)
    details.open = open
    return
  }
  details.dataset.routeUpdating = ""
  details.open = open
  routeMotionFrames.set(details, requestAnimationFrame(() => {
    routeMotionFrames.set(details, requestAnimationFrame(() => {
      delete details.dataset.routeUpdating; routeMotionFrames.delete(details)
    }))
  }))
}
export function consumeRouteDirectoryToggle(details: HTMLDetailsElement) {
  if (!routeToggles.has(details)) return false
  const automatic = routeToggles.get(details) === details.open
  routeToggles.delete(details)
  return automatic
}

// Preserve only the directory. Body classes, article/header markup and all
// index/Drive-specific components continue to come from the destination HTML.
export function retainDirectory(next: Document): () => void {
  const current = document.querySelector<HTMLElement>(".directory-scroll")
  const incoming = next.querySelector<HTMLElement>(".directory-scroll")
  if (!current) return () => {}
  if (!incoming || !current.dataset.directoryVersion || current.dataset.directoryVersion !== incoming.dataset.directoryVersion) {
    disposeDirectory(current)
    // A changed directory configuration requires fresh nodes/listeners,
    // rather than micromorph reusing an initialized-but-disposed explorer.
    if (incoming) current.replaceWith(incoming.cloneNode(true))
    return () => {}
  }
  // Mobile ancillary content may contain page-relative links: use the new
  // page's rendered content, while keeping the two directory trees intact.
  for (const selector of [".mobile-directory-recent", ".mobile-directory-links"]) {
    const oldSection = current.querySelector(selector), newSection = incoming.querySelector(selector)
    if (oldSection && newSection) oldSection.replaceWith(newSection.cloneNode(true))
  }
  for (const link of current.querySelectorAll<HTMLAnchorElement>("a[href]")) link.href = new URL(link.href, location.href).href
  const scrollPositions = [current, ...current.querySelectorAll<HTMLElement>(".explorer-content")]
    .map(node => ({ node, top: node.scrollTop, left: node.scrollLeft }))
  current.dataset.updating = ""
  const slotId = "quartz-retained-directory"
  const from = document.createElement("div"), to = next.createElement("div")
  from.id = to.id = slotId
  current.replaceWith(from); incoming.replaceWith(to)
  return () => {
    document.getElementById(slotId)?.replaceWith(current)
    // Detaching a scroll container can discard its position. Restore it before
    // the destination route starts its smooth movement to the active entry.
    for (const { node, top, left } of scrollPositions) node.scrollTo({ top, left, behavior: "instant" })
  }
}

export function finishDirectoryUpdate(scope: HTMLElement) {
  const root = scope.closest<HTMLElement>(".directory-scroll")!
  requestAnimationFrame(() => requestAnimationFrame(() => { if (root.isConnected) delete root.dataset.updating }))
}
