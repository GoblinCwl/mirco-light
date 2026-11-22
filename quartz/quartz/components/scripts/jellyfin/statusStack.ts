export function animatePlayerNoticeUpdates(container: HTMLElement, signal: AbortSignal) {
  const observer = new MutationObserver((records) => {
    const notices = new Set<HTMLElement>()
    for (const { target } of records) {
      const element = target instanceof Element ? target : target.parentElement
      const notice = element?.closest<HTMLElement>(".art-notice-inner,.quartz-status-chip")
      if (notice?.textContent) notices.add(notice)
    }
    for (const notice of notices) {
      const animation = notice.getAnimations().find(
        (entry) => entry instanceof CSSAnimation && entry.animationName === "quartz-player-status-enter",
      )
      // Updates during the entrance share the current animation.
      if (animation?.playState === "finished") {
        animation.currentTime = 0
        animation.play()
      }
    }
  })
  observer.observe(container, { subtree: true, childList: true, characterData: true })
  signal.addEventListener("abort", () => observer.disconnect(), { once: true })
}

/** One layout for both corners. Different notices coexist; repeated control
 * feedback (volume/seek) updates its existing row rather than filling the screen. */
export function createStatusStack(root: HTMLElement, side: "left" | "right", signal: AbortSignal) {
  const element = document.createElement("div")
  element.className = "quartz-status-stack"
  Object.assign(element.style, {
    position: "absolute",
    inset: side === "left" ? "12px auto auto 12px" : "12px 12px auto auto",
    width: "max-content",
    maxWidth: "calc(50% - 18px)",
    zIndex: "45",
    display: "flex",
    flexDirection: "column",
    alignItems: side === "left" ? "flex-start" : "flex-end",
    gap: "6px",
    pointerEvents: "none",
  })
  root.append(element)
  animatePlayerNoticeUpdates(element, signal)
  const row = () => {
    const item = document.createElement("span")
    item.setAttribute("role", "status")
    item.className = "quartz-status-chip"
    item.style.display = "none"
    element.append(item)
    return item
  }
  const pending = new Map<string, { item: HTMLElement; timer: ReturnType<typeof setTimeout> }>()
  const status = () => {
    const item = row()
    return (text: string) => {
      if (item.textContent === text) return
      item.textContent = text
      item.style.display = text ? "block" : "none"
    }
  }
  const notice = (text: string, key = text, duration = 6000) => {
    if (signal.aborted || !text) return
    const previous = pending.get(key)
    if (previous) clearTimeout(previous.timer)
    const item = previous?.item || row()
    item.textContent = text
    item.style.display = "block"
    const timer = setTimeout(() => {
      item.remove()
      pending.delete(key)
    }, duration)
    pending.set(key, { item, timer })
  }
  signal.addEventListener(
    "abort",
    () => {
      for (const value of pending.values()) clearTimeout(value.timer)
      pending.clear()
      element.remove()
    },
    { once: true },
  )
  return { element, status, notice }
}
