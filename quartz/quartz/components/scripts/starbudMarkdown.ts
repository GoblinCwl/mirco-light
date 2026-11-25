import { applyContentLinkPolicy } from "../../util/linkPolicy"
import { splitChineseAutolinks } from "../../util/markdownAutolinks"
import { isNonPreviewLink } from "../../util/previewPolicy"
import { projectReference } from "../../util/projectReference"
import { loadMarkdownRuntime, runtime } from "./markdownRuntime"

const tags = [
  "p", "br", "hr", "h1", "h2", "h3", "h4", "h5", "h6", "strong", "em", "del",
  "blockquote", "ul", "ol", "li", "pre", "code", "table", "thead", "tbody",
  "tr", "th", "td", "a", "img", "input",
]

export function preloadStarbudMarkdown() {
  return loadMarkdownRuntime().catch(() => {})
}

export function starbudMarkdownReady() {
  return !!(runtime.marked && runtime.DOMPurify)
}

export function renderStarbudMarkdown(host: HTMLElement, text: string, updated?: () => void) {
  const render = () => {
    const marked = runtime.marked!
    const tokenizer = splitChineseAutolinks(new marked.Tokenizer())
    const html = marked.parse(text, { gfm: true, async: false, tokenizer })
    const fragment = runtime.DOMPurify!.sanitize(html, {
      RETURN_DOM_FRAGMENT: true,
      ALLOWED_TAGS: tags,
      ALLOWED_ATTR: ["href", "src", "alt", "title", "type", "checked", "start", "align"],
      ALLOW_DATA_ATTR: false,
    })
    for (const input of fragment.querySelectorAll("input")) {
      if (input.type === "checkbox") input.disabled = true
      else input.remove()
    }
    for (const image of fragment.querySelectorAll("img")) {
      const source = image.getAttribute("src")
      const url = source && URL.parse(source, location.origin)
      if (url && url.origin === location.origin && url.pathname.startsWith("/static/")) {
        image.loading = "lazy"
        image.referrerPolicy = "no-referrer"
        image.setAttribute("no-view", "")
      } else {
        const link = document.createElement("a")
        if (url && /^https?:$/.test(url.protocol)) link.href = url.href
        link.textContent = image.alt || "查看图片"
        image.replaceWith(link)
      }
    }
    for (const anchor of fragment.querySelectorAll<HTMLAnchorElement>("a[href]")) {
      const href = anchor.getAttribute("href")!
      const url = URL.parse(href, location.origin)
      if (!url || url.username || url.password || !/^(https?:|mailto:)$/.test(url.protocol)) {
        anchor.removeAttribute("href")
        continue
      }
      if (!href.startsWith("#")) anchor.href = url.href
      applyContentLinkPolicy(anchor)
      if (href.startsWith("#") || isNonPreviewLink(url.href, location.href)) continue
      const project = projectReference(url.href, location.origin)
      anchor.classList.add("internal")
      if (project?.slug.startsWith("Repo/")) anchor.dataset.repoHover = "true"
      if (project?.slug.startsWith("Video/")) {
        anchor.dataset.starbudVideoPreview = project.slug.slice("Video/".length)
        anchor.dataset.noPopover = "true"
      }
    }
    host.replaceChildren(fragment)
    host.classList.remove("is-plain")
    updated?.()
  }
  host.classList.add("starbud-markdown")
  if (starbudMarkdownReady()) {
    render()
    return
  }
  host.classList.add("is-plain")
  const fallback = document.createTextNode(text)
  host.replaceChildren(fallback)
  void loadMarkdownRuntime().then(() => {
    if (host.isConnected && host.firstChild === fallback) render()
  }).catch(() => {})
}
