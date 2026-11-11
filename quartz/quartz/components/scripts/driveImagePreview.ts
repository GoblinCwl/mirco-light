import { node } from "./driveUi"
export function renderDriveImage(root: HTMLElement, url: string, name: string, signal: AbortSignal, failed: () => void, ready: () => void) {
  const viewer = node("div", "", "drive-image-viewer"), viewport = node("div", "", "drive-image-viewport"), image = node("img"), controls = node("div", "", "drive-image-controls"), dimensions = node("span")
  image.alt = name; image.draggable = false; image.decoding = "async"
  let zoom = 1, rotation = 0, x = 0, y = 0, drag: { id: number; x: number; y: number } | undefined
  const update = () => { image.style.transform = `translate(${x}px, ${y}px) rotate(${rotation}deg) scale(${zoom})`; viewport.style.cursor = zoom > 1 ? "grab" : "zoom-in" }
  const scale = (value: number) => { zoom = Math.max(.1, Math.min(10, value)); if (zoom <= 1) x = y = 0; update() }
  const reset = () => { zoom = 1; x = y = rotation = 0; update() }
  const button = (label: string, text: string, action: () => void) => { const element = node("button", text); element.type = "button"; element.title = label; element.setAttribute("aria-label", label); element.onclick = action; controls.append(element) }
  button("缩小图片", "−", () => scale(zoom / 1.25)); button("放大图片", "+", () => scale(zoom * 1.25))
  button("向左旋转", "↶", () => { rotation -= 90; update() }); button("向右旋转", "↷", () => { rotation += 90; update() })
  button("适应窗口", "适应", reset)
  button("原始尺寸", "原图", () => scale(image.naturalWidth / Math.max(1, image.clientWidth)))
  if (document.fullscreenEnabled) button("全屏查看图片", "全屏", () => { if (document.fullscreenElement === viewer) void document.exitFullscreen(); else void viewer.requestFullscreen().catch(() => {}) })
  controls.append(dimensions); viewport.append(image); viewer.append(viewport, controls); root.append(viewer)
  image.addEventListener("load", () => { dimensions.textContent = `${image.naturalWidth} × ${image.naturalHeight}`; update(); ready() }, { signal })
  image.addEventListener("error", failed, { signal, once: true })
  image.src = url
  viewport.addEventListener("wheel", event => { event.preventDefault(); scale(zoom * (event.deltaY < 0 ? 1.1 : 1 / 1.1)) }, { signal, passive: false })
  viewport.addEventListener("dblclick", () => zoom === 1 ? scale(2) : reset(), { signal })
  viewport.addEventListener("pointerdown", event => { if (zoom <= 1 || event.button !== 0) return; drag = { id: event.pointerId, x: event.clientX - x, y: event.clientY - y }; viewport.setPointerCapture(event.pointerId) }, { signal })
  viewport.addEventListener("pointermove", event => { if (drag?.id !== event.pointerId) return; x = event.clientX - drag.x; y = event.clientY - drag.y; update() }, { signal })
  const release = () => { drag = undefined }; viewport.addEventListener("pointerup", release, { signal }); viewport.addEventListener("pointercancel", release, { signal })
  signal.addEventListener("abort", () => image.removeAttribute("src"), { once: true })
}
