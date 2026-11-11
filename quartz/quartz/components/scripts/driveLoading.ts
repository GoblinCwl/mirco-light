const pendingLoads = new WeakMap<HTMLElement, Set<symbol>>()
const progressOwners = new WeakMap<HTMLElement, symbol>()

export function driveFileProgress(scope: HTMLElement, signal: AbortSignal) {
  const root = scope.closest<HTMLElement>("[data-openlist]")
  const indicator = root?.querySelector<HTMLElement>("[data-drive-page-loading]")
  if (!root || !indicator || signal.aborted) return { update: (_value: number) => {}, clear: () => {} }
  const owner = Symbol()
  progressOwners.set(root, owner)
  const clear = () => {
    if (progressOwners.get(root) !== owner) return
    indicator.classList.remove("has-progress", "is-rendering")
    indicator.style.removeProperty("--drive-progress")
    indicator.setAttribute("role", "status"); indicator.setAttribute("aria-label", "正在读取 Share")
    for (const name of ["aria-valuenow", "aria-valuemin", "aria-valuemax"]) indicator.removeAttribute(name)
  }
  clear()
  signal.addEventListener("abort", clear, { once: true })
  return {
    clear,
    update(value: number) {
      if (signal.aborted || progressOwners.get(root) !== owner || !Number.isFinite(value)) return
      const progress = Math.max(0, Math.min(1, value)), percent = Math.round(progress * 100)
      indicator.classList.add("has-progress"); indicator.classList.toggle("is-rendering", progress === 1); indicator.style.setProperty("--drive-progress", String(progress))
      indicator.setAttribute("role", "progressbar"); indicator.setAttribute("aria-valuemin", "0"); indicator.setAttribute("aria-valuemax", "100")
      indicator.setAttribute("aria-valuenow", String(percent)); indicator.setAttribute("aria-label", progress === 1 ? "文件下载完成，正在准备预览" : `正在加载文件 ${percent}%`)
    },
  }
}

// Page requests and preview readiness share one indicator. An older request
// finishing or being cancelled must not hide a newer preview's loading state.
export function beginDriveLoading(scope: HTMLElement, signal: AbortSignal): () => void {
  const root = scope.closest<HTMLElement>("[data-openlist]")
  const indicator = root?.querySelector<HTMLElement>("[data-drive-page-loading]")
  if (!root || !indicator || signal.aborted) return () => {}
  let pending = pendingLoads.get(root)
  if (!pending) { pending = new Set(); pendingLoads.set(root, pending) }
  const loads = pending, token = Symbol()
  loads.add(token); indicator.hidden = false
  root.setAttribute("data-drive-loading", "")
  const finish = () => {
    loads.delete(token)
    indicator.hidden = loads.size === 0
    root.toggleAttribute("data-drive-loading", loads.size > 0)
    signal.removeEventListener("abort", finish)
  }
  signal.addEventListener("abort", finish, { once: true })
  return finish
}

// Keep page loading independent of header/content height; fit file previews separately.
// There is one observer per Drive page, rather than listeners on every spinner.
export function setupDriveLoading(root: HTMLElement, signal: AbortSignal) {
  const stage = root.querySelector<HTMLElement>(".drive-stage")!
  const preview = root.querySelector<HTMLElement>("[data-drive-preview-body]")!
  const pageHeader = root.closest(".center")?.querySelector<HTMLElement>(".page-header")
  let frame = 0
  const position = () => {
    frame = 0
    if (signal.aborted || !root.isConnected) return
    const bounds = stage.getBoundingClientRect(), viewport = window.visualViewport
    const viewportTop = viewport?.offsetTop || 0, viewportLeft = viewport?.offsetLeft || 0
    const bottom = viewportTop + (viewport?.height || innerHeight)
    const left = Math.max(bounds.left, viewportLeft), right = Math.min(bounds.right, viewportLeft + (viewport?.width || innerWidth))
    const video = preview.querySelector('.drive-renderer-frame:is([data-preview-kind="video"], [data-preview-kind="aliyun_video"])')
    if (video || window.matchMedia("(max-width: 1199px)").matches) {
      root.style.removeProperty("--drive-preview-height")
    } else if (preview.checkVisibility()) {
      const previewBounds = preview.getBoundingClientRect()
      const afterPreview = Math.max(0, root.getBoundingClientRect().bottom - previewBounds.bottom)
      const height = Math.max(0, bottom - (previewBounds.top + window.scrollY) - afterPreview - 16)
      root.style.setProperty("--drive-preview-height", `${Math.floor(height)}px`)
    }
    // Only horizontal alignment follows the content column. Vertical placement
    // stays in CSS so it is identical before and after initialization.
    root.style.setProperty("--drive-loader-x", `${(left + right) / 2}px`)
    for (const loader of root.querySelectorAll<HTMLElement>("[data-drive-page-loading]")) {
      if (loader.hidden || !loader.checkVisibility()) continue
      loader.style.visibility = bottom > viewportTop && right > left ? "visible" : "hidden"
      loader.classList.add("is-positioned")
    }
  }
  const schedule = () => { if (!frame) frame = requestAnimationFrame(position) }
  const observer = new MutationObserver(schedule)
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] })
  const resized = new ResizeObserver(schedule); resized.observe(stage)
  if (pageHeader) resized.observe(pageHeader)
  window.addEventListener("resize", schedule, { signal, passive: true })
  window.addEventListener("scroll", schedule, { signal, passive: true, capture: true })
  window.visualViewport?.addEventListener("resize", schedule, { signal, passive: true })
  window.visualViewport?.addEventListener("scroll", schedule, { signal, passive: true })
  signal.addEventListener("abort", () => { cancelAnimationFrame(frame); observer.disconnect(); resized.disconnect() }, { once: true })
  schedule()
}
