// The notification center is a same-origin Vue iframe with its own theme state.
// Use its theme control so Vue, icons and nested views all update without reloads.
export function syncArtalkNotificationTheme() {
  const frames = new Set<HTMLIFrameElement>()
  const documents = new Map<HTMLIFrameElement, { document: Document; observer: MutationObserver }>()
  const timers = new Set<ReturnType<typeof setTimeout>>()
  let stopped = false
  const apply = (frame: HTMLIFrameElement) => {
    if (stopped || !frame.isConnected) return
    try {
      if (new URL(frame.src, location.href).origin !== location.origin) return
      const doc = frame.contentDocument
      if (!doc) return
      if (documents.get(frame)?.document !== doc) {
        documents.get(frame)?.observer.disconnect()
        const observer = new MutationObserver(() => apply(frame))
        observer.observe(doc, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "data-darkmode"] })
        documents.set(frame, { document: doc, observer })
      }
      const control = doc.querySelector<HTMLElement>(".dark-mode-toggle[data-darkmode]")
      if (!control) return
      const desired = document.documentElement.getAttribute("saved-theme") === "dark" ? "on" : "off"
      if (control.dataset.darkmode !== desired) {
        frame.removeAttribute("data-notification-theme-ready")
        control.click()
        return
      }
      const panel = doc.querySelector(".app-wrap.atk-sidebar")
      if (panel && panel.classList.contains("atk-dark-mode") === (desired === "on")) {
        frame.setAttribute("data-notification-theme-ready", "true")
      }
    } catch { /* A cross-origin notification center cannot be modified here. */ }
  }
  const refresh = () => {
    document.querySelectorAll<HTMLIFrameElement>(".atk-sidebar-iframe-wrap iframe").forEach(frame => {
      if (!frames.has(frame)) {
        frames.add(frame)
        frame.addEventListener("load", onLoad)
      }
      apply(frame)
    })
  }
  const onLoad = (event: Event) => {
    (event.currentTarget as HTMLIFrameElement)?.removeAttribute("data-notification-theme-ready")
    refresh()
    for (const delay of [0, 100, 350]) {
      const timer = setTimeout(() => { timers.delete(timer); refresh() }, delay)
      timers.add(timer)
    }
  }
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === "attributes" && record.target instanceof HTMLIFrameElement && record.target.matches(".atk-sidebar-iframe-wrap iframe")) {
        record.target.removeAttribute("data-notification-theme-ready")
      }
    }
    if (records.some(record => [...record.addedNodes].some(node => node instanceof Element &&
      (node.matches("iframe, .atk-sidebar-layer") || node.querySelector(".atk-sidebar-iframe-wrap iframe"))))) refresh()
  })
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["src"] })
  document.addEventListener("themechange", refresh)
  refresh()
  return () => {
    stopped = true
    observer.disconnect()
    document.removeEventListener("themechange", refresh)
    for (const timer of timers) clearTimeout(timer)
    for (const { observer } of documents.values()) observer.disconnect()
    documents.clear()
    for (const frame of frames) frame.removeEventListener("load", onLoad)
    frames.clear()
  }
}
