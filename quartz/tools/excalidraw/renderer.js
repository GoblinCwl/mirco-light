import { exportScene } from "@excalidraw/utils"
import LZString from "lz-string"

export function parseScene(payload, encoding) {
  const text = encoding === "lz-base64"
    ? LZString.decompressFromBase64(payload.replace(/\s/g, ""))
    : new TextDecoder().decode(Uint8Array.from(atob(payload), char => char.charCodeAt(0)))
  if (!text) throw new Error("绘图数据为空或无法解压")
  const scene = JSON.parse(text)
  if (scene.type !== "excalidraw" || !Array.isArray(scene.elements)) throw new Error("不是有效的 Excalidraw 绘图")
  return scene
}

export async function renderScene(scene, theme) {
  const elements = scene.elements.filter(element => !element.isDeleted)
  if (!elements.length) throw new Error("这张绘图没有可展示的内容")
  const svg = await exportScene({
    type: "svg",
    data: { elements, files: scene.files || {}, appState: scene.appState || {} },
    config: { theme, padding: 24, canvasBackgroundColor: false, skipInliningFonts: true, renderEmbeddables: false },
  })
  // Keep the readonly viewer self-contained; embedded web pages are not executed.
  svg.querySelectorAll("script,foreignObject,iframe").forEach(element => element.remove())
  svg.querySelectorAll("a").forEach(link => { link.setAttribute("target", "_blank"); link.setAttribute("rel", "noopener noreferrer") })
  return svg
}
