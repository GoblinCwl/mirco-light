import { node } from "./driveUi"

const cleanups = new WeakMap<HTMLElement, () => void>()
export function resetMediaOverview(panel: HTMLElement, reserve = false) {
  cleanups.get(panel)?.()
  panel.replaceChildren(); panel.hidden = true
  panel.classList.toggle("has-overview-reserve", reserve)
  panel.classList.remove("is-overview-expanded")
}
export function normalizeMediaOverview(value: string) {
  return value.replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ").split("\n").map(line => line.trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim()
}
export function renderMediaOverview(panel: HTMLElement, value: string, options: { title?: string; reserve?: boolean; signal?: AbortSignal } = {}) {
  resetMediaOverview(panel, options.reserve)
  if (options.signal?.aborted) return
  const heading = node("h2", options.title || "剧情简介"), body = node("div", "", "drive-media-overview")
  body.id = `media-overview-${crypto.randomUUID()}`
  for (const paragraph of normalizeMediaOverview(value).split(/\n\n/)) body.append(node("p", paragraph))
  const toggle = node("button", "展开简介", "drive-media-overview-toggle")
  toggle.type = "button"; toggle.hidden = true
  toggle.setAttribute("aria-expanded", "false"); toggle.setAttribute("aria-controls", body.id)
  toggle.onclick = () => {
    const expanded = panel.classList.toggle("is-overview-expanded")
    toggle.textContent = expanded ? "收起简介" : "展开简介"
    toggle.setAttribute("aria-expanded", String(expanded))
  }
  panel.append(heading, body, toggle); panel.hidden = false
  const compact = matchMedia("(max-width: 800px)")
  const measure = () => {
    if (!body.isConnected || !body.clientWidth) return
    toggle.hidden = body.scrollHeight <= parseFloat(getComputedStyle(body).lineHeight) * (compact.matches ? 3 : 5) + 1
  }
  const observer = new ResizeObserver(measure); observer.observe(body)
  compact.addEventListener("change", measure)
  const cleanup = () => { compact.removeEventListener("change", measure); observer.disconnect(); options.signal?.removeEventListener("abort", cleanup); cleanups.delete(panel) }
  cleanups.set(panel, cleanup); options.signal?.addEventListener("abort", cleanup, { once: true })
  void document.fonts.ready.then(() => { if (body.isConnected && !options.signal?.aborted) measure() })
}
