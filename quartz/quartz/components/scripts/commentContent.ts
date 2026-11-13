export const safeUrl = (value: string) => {
  if (!value.trim()) return null
  try {
    const url = new URL(value, window.location.origin)
    return ["http:", "https:"].includes(url.protocol) ? url.href : null
  } catch { return null }
}

// Rebuild a small presentation-only subset of HTML; discard all event/style attributes.
export function commentContent(html: string) {
  const template = document.createElement("template")
  template.innerHTML = html
  const allowed = new Set(["P", "BR", "STRONG", "EM", "B", "I", "S", "DEL", "BLOCKQUOTE", "CODE", "PRE", "UL", "OL", "LI", "A", "IMG", "SPAN"])
  const forbidden = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "SVG", "MATH", "FORM", "INPUT", "BUTTON", "LINK", "META"])
  const copy = (node: Node): Node | null => {
    if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent ?? "")
    if (!(node instanceof HTMLElement) || forbidden.has(node.tagName)) return null
    const result = allowed.has(node.tagName) ? document.createElement(node.tagName.toLowerCase()) : document.createDocumentFragment()
    if (result instanceof HTMLAnchorElement) {
      const href = safeUrl(node.getAttribute("href") ?? "")
      if (href) { result.href = href; result.target = "_blank"; result.rel = "nofollow noopener noreferrer" }
    }
    if (result instanceof HTMLImageElement) {
      const src = safeUrl(node.getAttribute("src") ?? "")
      if (!src) return null
      result.src = src
      for (const dimension of ["width", "height"]) {
        const value = node.getAttribute(dimension)
        if (value && /^[1-9]\d{0,4}$/.test(value)) result.setAttribute(dimension, value)
      }
      result.alt = node.getAttribute("alt") || node.getAttribute("atk-emoticon") || "评论图片"
      result.loading = "lazy"
      result.referrerPolicy = "no-referrer"
      if (node.hasAttribute("atk-emoticon")) {
        result.className = "comments-emoticon"
        result.setAttribute("no-view", "")
      }
    }
    node.childNodes.forEach((child) => { const safe = copy(child); if (safe) result.appendChild(safe) })
    return result
  }
  const fragment = document.createDocumentFragment()
  template.content.childNodes.forEach((node) => { const safe = copy(node); if (safe) fragment.appendChild(safe) })
  return fragment
}

