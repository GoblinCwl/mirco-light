type PreviewOptions = {
  preload?: boolean
  /** Position the panel below this element instead of the whole hover target. */
  anchor?: HTMLElement
  /** Additional hover/focus targets that share this preview's position/logic. */
  triggers?: HTMLElement[]
  /** Video duration in seconds, used to stop background playback after it ends. */
  duration?: number
}

const PLAYER = (bvid: string) =>
  `https://player.bilibili.com/player.html?${new URLSearchParams({
    bvid,
    p: "1",
    high_quality: "1",
    danmaku: "0",
    autoplay: "1",
    muted: "1",
  }).toString()}`

let activePreview: (() => void) | undefined

const removePanels = () => {
  document.querySelectorAll(".video-hover-preview").forEach((panel) => panel.remove())
}

export function clearVideoPreviews() {
  activePreview?.()
  activePreview = undefined
  removePanels()
}

/**
 * Opens a muted Bilibili iframe preview below an element. The optional preload
 * creates the player off-screen early so the first hover can show it instantly.
 */
export function attachVideoPreview(
  element: HTMLElement,
  bvid: string,
  _poster?: string,
  options: PreviewOptions = {},
): () => void {
  const canHover = window.matchMedia("(hover: hover)").matches || navigator.maxTouchPoints === 0
  if (!canHover) return () => {}
  for(const target of [element,...(options.triggers||[])]){target.removeAttribute('title');target.querySelectorAll('[title]').forEach(child=>child.removeAttribute('title'))}

  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
  // Prefer an isolated anonymous player; unsupported browsers retain normal playback.
  const anonymousPlayer = window.isSecureContext && "credentialless" in HTMLIFrameElement.prototype
  const shouldPreload = options.preload === true && !connection?.saveData

  let panel: HTMLDivElement | undefined
  let frame: HTMLIFrameElement | undefined
  let loading: HTMLSpanElement | undefined
  let showTimer: number | undefined
  let hideTimer: number | undefined
  let preloadTimer: number | undefined
  let loadTimer: number | undefined
  let endTimer: number | undefined
  let rebuildTimer: number | undefined
  let startedAt = 0
  let expired = false
  let disposed = false

  const position = () => {
    if (!panel) return
    const rect = element.getBoundingClientRect()
    const anchorRect =
      options.anchor?.isConnected === true ? options.anchor.getBoundingClientRect() : rect
    const gap = 16
    const width = Math.min(672, Math.max(240, rect.width), window.innerWidth - gap * 2)
    const height = Math.round((width * 9) / 16)
    const left = Math.max(gap, Math.min(rect.left, window.innerWidth - width - gap))

    let top = anchorRect.bottom + gap
    if (top + height > window.innerHeight - gap) {
      const above = anchorRect.top - height - gap
      top = above >= gap ? above : Math.max(gap, window.innerHeight - height - gap)
    }

    panel.style.width = `${width}px`
    panel.style.height = `${height}px`
    panel.style.left = `${left}px`
    panel.style.top = `${top}px`
  }

  const createPanel = () => {
    if (panel) return
    expired = false
    startedAt = performance.now()
    panel = document.createElement("div")
    panel.className = "video-hover-preview"
    panel.setAttribute("aria-label", "视频预览")

    loading = document.createElement("span")
    loading.className = "video-preview-loading"
    loading.textContent = "正在加载预览…"

    frame = document.createElement("iframe")
    // Set isolation before src/attachment when the browser supports it.
    if (anonymousPlayer) frame.setAttribute("credentialless", "")
    frame.referrerPolicy = "no-referrer"
    frame.src = PLAYER(bvid)
    frame.title = "B 站视频预览"
    frame.loading = "lazy"
    frame.allow = "autoplay; fullscreen; picture-in-picture; encrypted-media"
    frame.allowFullscreen = true
    frame.addEventListener("load", () => {
      loadTimer = window.setTimeout(() => panel?.classList.add("is-ready"), 1200)
    })
    panel.append(loading, frame)

    panel.addEventListener("mouseenter", cancelHide)
    panel.addEventListener("mouseleave", scheduleHide)
    panel.addEventListener("focusin", cancelHide)
    panel.addEventListener("focusout", onPanelFocusOut)

    if (shouldPreload) {
      panel.style.left = "-9999px"
      panel.style.top = "-9999px"
      panel.style.width = "320px"
      panel.style.height = "180px"
    }
    document.body.append(panel)
    activePreview = destroy
  }

  const destroy = () => {
    if (showTimer) window.clearTimeout(showTimer)
    if (hideTimer) window.clearTimeout(hideTimer)
    if (preloadTimer) window.clearTimeout(preloadTimer)
    if (loadTimer) window.clearTimeout(loadTimer)
    if (endTimer) window.clearTimeout(endTimer)
    if (rebuildTimer) window.clearTimeout(rebuildTimer)
    showTimer = undefined
    hideTimer = undefined
    preloadTimer = undefined
    loadTimer = undefined
    endTimer = undefined
    rebuildTimer = undefined
    if (panel) {
      panel.removeEventListener("mouseenter", cancelHide)
      panel.removeEventListener("mouseleave", scheduleHide)
      panel.removeEventListener("focusin", cancelHide)
      panel.removeEventListener("focusout", onPanelFocusOut)
      if (frame) frame.src = "about:blank"
      panel.remove()
      panel = undefined
      frame = undefined
      loading = undefined
    }
    window.removeEventListener("scroll", position, true)
    window.removeEventListener("resize", position)
    if (activePreview === destroy) activePreview = undefined
    // Keep a fresh hidden player ready for the next hover.
    if (shouldPreload && !disposed && element.isConnected) {
      rebuildTimer = window.setTimeout(preload, 0)
    }
  }

  const show = () => {
    if (disposed || !element.isConnected) return
    if (!panel) {
      clearVideoPreviews()
      createPanel()
    }
    if (!panel) return
    position()
    panel.classList.add("is-visible")
    scheduleEnd()
  }

  const scheduleEnd = () => {
    if (!shouldPreload || !options.duration || options.duration <= 0) return
    if (endTimer) window.clearTimeout(endTimer)
    const remaining = Math.max(0, options.duration * 1000 - (performance.now() - startedAt))
    if (remaining === 0) {
      if (panel?.classList.contains("is-visible")) {
        expired = true
        return
      }
      destroy()
      return
    }
    endTimer = window.setTimeout(() => {
      if (!panel) return
      if (panel.classList.contains("is-visible")) {
        expired = true
        return
      }
      destroy()
    }, remaining)
  }

  const hide = () => {
    if (!panel) return
    panel.classList.remove("is-visible")
    scheduleEnd()
  }

  const cancelHide = () => {
    if (hideTimer) window.clearTimeout(hideTimer)
    hideTimer = undefined
  }

  const scheduleHide = () => {
    cancelHide()
    hideTimer = window.setTimeout(() => {
      if (shouldPreload && !expired) hide()
      else destroy()
    }, 180)
  }

  const onPanelFocusOut = (event: FocusEvent) => {
    const next = event.relatedTarget
    if (next instanceof Node && panel?.contains(next)) return
    scheduleHide()
  }

  const enter = () => {
    cancelHide()
    if (!showTimer) showTimer = window.setTimeout(show, 240)
  }

  const leave = () => {
    if (showTimer) window.clearTimeout(showTimer)
    showTimer = undefined
    if (panel) scheduleHide()
  }

  const onElementFocusOut = (event: FocusEvent) => {
    const next = event.relatedTarget
    if (next instanceof Node && panel?.contains(next)) return
    leave()
  }

  const preload = () => {
    if (disposed || panel || !element.isConnected) return
    createPanel()
    position()
    hide()
  }

  if (shouldPreload) {
    preloadTimer = window.setTimeout(preload, 0)
  }

  const triggers = options.triggers?.length ? options.triggers : [element]
  for (const trigger of triggers) {
    trigger.addEventListener("mouseenter", enter)
    trigger.addEventListener("mouseleave", leave)
    trigger.addEventListener("focusin", enter)
    trigger.addEventListener("focusout", onElementFocusOut)
  }

  return () => {
    disposed = true
    for (const trigger of triggers) {
      trigger.removeEventListener("mouseenter", enter)
      trigger.removeEventListener("mouseleave", leave)
      trigger.removeEventListener("focusin", enter)
      trigger.removeEventListener("focusout", onElementFocusOut)
    }
    destroy()
  }
}
