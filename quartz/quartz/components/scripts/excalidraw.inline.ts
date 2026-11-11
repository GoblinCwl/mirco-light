import { excalidrawRendererUrl } from "./excalidrawRendererVersion"
import { setupPreviewWebFullscreen } from "./drivePreviewFullscreen"

type Renderer = {
  parseScene(payload: string, encoding: string): unknown
  renderScene(scene: unknown, theme: string): Promise<SVGSVGElement>
}
let renderer: Promise<Renderer> | undefined
const loadRenderer = () => renderer ??= import(excalidrawRendererUrl).catch(error => { renderer = undefined; throw error })
const currentTheme = () => document.documentElement.getAttribute("saved-theme") === "dark" ? "dark" : "light"
const viewers = new Map<HTMLElement, AbortController>()
const icon = (path: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`

async function mountDrawing(host: HTMLElement, signal: AbortSignal) {
  const toolbar = document.createElement("div"); toolbar.className = "excalidraw-toolbar"
  const label = document.createElement("span"); label.className = "excalidraw-label"; label.textContent = "绘图"
  const controls = document.createElement("div"); controls.className = "excalidraw-controls"
  const viewport = document.createElement("div"); viewport.className = "excalidraw-viewport"; viewport.tabIndex = 0; viewport.setAttribute("aria-label", "绘图，可拖动、双指缩放或使用方向键移动")
  const status = host.querySelector<HTMLElement>(".excalidraw-status") || document.createElement("div")
  const percentage = document.createElement("span"); percentage.className = "excalidraw-zoom"; percentage.textContent = "—"
  let svg: SVGSVGElement | undefined, width = 1, height = 1, scale = 1, x = 0, y = 0
  let renderId = 0, scene: unknown, api: Renderer
  const clamp = (value: number) => Math.max(.02, Math.min(8, value))
  const draw = () => {
    if (!svg) return
    svg.style.transform = `translate(${x}px, ${y}px) scale(${scale})`
    percentage.textContent = `${Math.round(scale * 100)}%`
  }
  const fit = () => {
    if (!svg) return
    scale = Math.min((viewport.clientWidth - 32) / width, (viewport.clientHeight - 32) / height, 1)
    x = (viewport.clientWidth - width * scale) / 2; y = (viewport.clientHeight - height * scale) / 2; draw()
  }
  const zoom = (next: number, px = viewport.clientWidth / 2, py = viewport.clientHeight / 2) => {
    const target = clamp(next), ratio = target / scale
    x = px - (px - x) * ratio; y = py - (py - y) * ratio; scale = target; draw()
  }
  const button = (name: string, path: string, click: () => void) => {
    const element = document.createElement("button"); element.type = "button"; element.title = name; element.setAttribute("aria-label", name); element.innerHTML = icon(path)
    element.disabled = true; element.addEventListener("click", click, { signal }); controls.append(element); return element
  }
  button("缩小绘图", '<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6M7 10h6"/>', () => zoom(scale / 1.25))
  controls.append(percentage)
  button("放大绘图", '<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6M7 10h6m-3-3v6"/>', () => zoom(scale * 1.25))
  button("适应窗口", '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M8 8h8v8H8z"/>', fit)
  const webFullscreen = setupPreviewWebFullscreen(host, signal)
  const fullscreen = button("全屏查看绘图", '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>', () => { void toggleFullscreen() })
  const isFullscreen = () => document.fullscreenElement === host || host.classList.contains("is-web-fullscreen")
  const syncFullscreen = () => {
    const active = isFullscreen(), name = active ? "退出绘图全屏" : "全屏查看绘图"
    fullscreen.title = name; fullscreen.setAttribute("aria-label", name); fullscreen.setAttribute("aria-pressed", String(active))
    fullscreen.innerHTML = icon(active ? '<path d="M3 8h5V3m8 0v5h5M3 16h5v5m8 0v-5h5"/>' : '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>')
  }
  async function toggleFullscreen() {
    if (host.classList.contains("is-web-fullscreen")) webFullscreen(false)
    else if (document.fullscreenElement === host) await document.exitFullscreen()
    else {
      const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || /Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1
      try { if (ios || !host.requestFullscreen) throw new Error("web fullscreen"); await host.requestFullscreen() }
      catch { if (!signal.aborted) webFullscreen(true) }
    }
    syncFullscreen()
  }
  document.addEventListener("fullscreenchange", syncFullscreen, { signal })
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && host.classList.contains("is-web-fullscreen")) { event.preventDefault(); webFullscreen(false); syncFullscreen() }
  }, { signal })
  viewport.addEventListener("wheel", event => {
    if (!svg) return
    event.preventDefault(); const rect = viewport.getBoundingClientRect()
    zoom(scale * Math.exp(-event.deltaY * .0015), event.clientX - rect.left, event.clientY - rect.top)
  }, { signal, passive: false })
  const pointers = new Map<number, { x: number; y: number }>()
  const gesture = () => {
    const values = [...pointers.values()], a = values[0], b = values[1] || a
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.hypot(a.x - b.x, a.y - b.y) }
  }
  viewport.addEventListener("pointerdown", event => {
    if (!svg || event.button !== 0) return
    const rect = viewport.getBoundingClientRect(); pointers.set(event.pointerId, { x: event.clientX - rect.left, y: event.clientY - rect.top })
    viewport.setPointerCapture(event.pointerId); viewport.classList.add("is-dragging")
  }, { signal })
  viewport.addEventListener("pointermove", event => {
    if (!pointers.has(event.pointerId) || !svg) return
    const before = gesture(), rect = viewport.getBoundingClientRect()
    pointers.set(event.pointerId, { x: event.clientX - rect.left, y: event.clientY - rect.top })
    const after = gesture(), next = before.distance && pointers.size > 1 ? clamp(scale * after.distance / before.distance) : scale
    x = after.x - (before.x - x) * next / scale; y = after.y - (before.y - y) * next / scale; scale = next; draw()
  }, { signal })
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) viewport.addEventListener(type, event => {
    pointers.delete((event as PointerEvent).pointerId); if (!pointers.size) viewport.classList.remove("is-dragging")
  }, { signal })
  viewport.addEventListener("keydown", event => {
    if (!svg) return
    if (["+", "="].includes(event.key)) zoom(scale * 1.25)
    else if (event.key === "-") zoom(scale / 1.25)
    else if (event.key === "0") fit()
    else if (event.key.startsWith("Arrow")) { x += event.key === "ArrowLeft" ? 40 : event.key === "ArrowRight" ? -40 : 0; y += event.key === "ArrowUp" ? 40 : event.key === "ArrowDown" ? -40 : 0; draw() }
    else return
    event.preventDefault()
  }, { signal })
  toolbar.append(label, controls); viewport.append(status); host.replaceChildren(toolbar, viewport)
  const observer = new ResizeObserver(fit); observer.observe(viewport)
  signal.addEventListener("abort", () => { observer.disconnect(); pointers.clear() }, { once: true })
  const render = async () => {
    const id = ++renderId
    try {
      api ??= await loadRenderer()
      if (signal.aborted) return
      scene ??= api.parseScene(host.dataset.excalidrawScene!, host.dataset.excalidrawEncoding!)
      const renderTheme = currentTheme()
      const drawing = await api.renderScene(scene, renderTheme)
      if (signal.aborted || id !== renderId) return
      const initial = !svg
      svg?.remove(); svg = drawing
      const bounds = drawing.viewBox.baseVal
      width = bounds.width || Number(drawing.getAttribute("width")); height = bounds.height || Number(drawing.getAttribute("height"))
      if (!(width > 0 && height > 0)) throw new Error("绘图尺寸无效")
      drawing.style.width = `${width}px`; drawing.style.height = `${height}px`
      drawing.setAttribute("role", "img"); drawing.setAttribute("aria-label", "Excalidraw 绘图")
      drawing.dataset.theme = renderTheme
      status.remove(); viewport.append(drawing)
      for (const control of controls.querySelectorAll("button")) control.disabled = false
      if (initial) fit(); else draw()
    } catch (error) {
      if (signal.aborted || id !== renderId) return
      status.className = "excalidraw-status"; status.replaceChildren()
      const message = document.createElement("span"); message.style.cssText = "width:auto;height:auto;border:0;animation:none"; message.textContent = error instanceof Error ? `绘图加载失败：${error.message}` : "绘图加载失败"
      status.append(message); if (!status.isConnected) viewport.append(status)
    }
  }
  const themeObserver = new MutationObserver(() => { void render() })
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["saved-theme"] })
  signal.addEventListener("abort", () => themeObserver.disconnect(), { once: true })
  await render()
}

function initializeDrawings() {
  for (const host of document.querySelectorAll<HTMLElement>(".excalidraw-viewer[data-excalidraw-scene]")) {
    if (viewers.has(host)) continue
    const controller = new AbortController(); viewers.set(host, controller)
    void mountDrawing(host, controller.signal)
  }
}
document.addEventListener("nav", () => {
  for (const controller of viewers.values()) controller.abort()
  viewers.clear(); initializeDrawings()
})
document.addEventListener("decryptComplete", initializeDrawings)
initializeDrawings()
