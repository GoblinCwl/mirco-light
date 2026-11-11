// Extract before Obsidian's %% comments are removed: the drawing lives inside
// such a comment. Keep front matter intact for publication, tags and encryption.
export function excalidrawMarkdown(source: string): string {
  const frontmatter = /^(---\r?\n[\s\S]*?\r?\n---)(?:\r?\n|$)/.exec(source)
  if (!frontmatter || !/^excalidraw-plugin\s*:/m.test(frontmatter[1])) return source
  const drawing = /^## Drawing\s*\r?\n[\s\S]*?```(compressed-json|json)\s*\r?\n([\s\S]*?)\r?\n```/m.exec(source)
  if (!drawing) return source
  const compressed = drawing[1] === "compressed-json"
  const payload = compressed ? drawing[2].replace(/\s/g, "") : Buffer.from(drawing[2], "utf8").toString("base64")
  return `${frontmatter[1]}\n\n<figure class="excalidraw-viewer" data-excalidraw-encoding="${compressed ? "lz-base64" : "json-base64"}" data-excalidraw-scene="${payload.replace(/[^A-Za-z0-9+/=]/g, "")}" aria-label="Excalidraw 绘图"><div class="excalidraw-status" role="status" aria-label="正在加载绘图"><span></span></div></figure>\n`
}
