// Preserve simple metadata formatting without executing HTML/scripts or inline styles.
export function renderDriveMetadata(target: HTMLElement, source?: string) {
  target.replaceChildren()
  target.hidden = !source?.trim()
  if (!source?.trim()) return
  const document = new DOMParser().parseFromString(source.slice(0, 100000), "text/html")
  const allowed = new Set(["DIV", "SPAN", "P", "BR", "HR", "H1", "H2", "H3", "H4", "H5", "H6", "STRONG", "B", "EM", "I", "S", "UL", "OL", "LI", "BLOCKQUOTE", "PRE", "CODE", "A"])
  const blocked = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "SVG", "MATH", "FORM", "INPUT", "BUTTON", "TEMPLATE"])
  const append = (parent: HTMLElement, child: Node) => {
    if (child.nodeType === Node.TEXT_NODE) { parent.append(window.document.createTextNode(child.textContent || "")); return }
    if (!(child instanceof HTMLElement) || blocked.has(child.tagName)) return
    if (!allowed.has(child.tagName)) { for (const node of child.childNodes) append(parent, node); return }
    const element = window.document.createElement(child.tagName === "H1" ? "h2" : child.tagName.toLowerCase())
    if (element instanceof HTMLAnchorElement && child.hasAttribute("href")) {
      try {
        const url = new URL(child.getAttribute("href") || "", "https://drive.goblincwl.site/")
        if (["https:", "http:"].includes(url.protocol)) { element.href = url.href; element.target = "_blank"; element.rel = "noopener noreferrer" }
      } catch { /* Invalid metadata links remain plain text. */ }
    }
    for (const node of child.childNodes) append(element, node)
    parent.append(element)
  }
  for (const child of document.body.childNodes) append(target, child)
}
