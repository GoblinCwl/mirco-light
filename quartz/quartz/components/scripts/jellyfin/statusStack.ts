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
  const row = () => {
    const item = document.createElement("span")
    item.setAttribute("role", "status")
    Object.assign(item.style, {
      display: "none",
      maxWidth: "100%",
      boxSizing: "border-box",
      padding: "4px 8px",
      fontSize: "12px",
      lineHeight: "1.5",
      borderRadius: "4px",
      overflowWrap: "anywhere",
      background: "var(--background)",
      color: "var(--foreground)",
    })
    element.append(item)
    return item
  }
  const pending = new Map<string, { item: HTMLElement; timer: ReturnType<typeof setTimeout> }>()
  const status = () => {
    const item = row()
    return (text: string) => {
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
