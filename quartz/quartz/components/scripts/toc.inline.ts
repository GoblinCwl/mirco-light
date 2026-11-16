import { setupTocTracking } from "./tocTracking"

function setupTocHighlighting() {
  const headers = Array.from(
    document.querySelectorAll<HTMLElement>("h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]"),
  )
  const tocEntries = new Map<string, HTMLAnchorElement[]>()
  document.querySelectorAll<HTMLAnchorElement>(".toc a[data-for]").forEach((entry) => {
    const slug = entry.dataset.for
    if (!slug) return
    tocEntries.set(slug, [...(tocEntries.get(slug) ?? []), entry])
  })

  window.addCleanup(setupTocTracking(headers, tocEntries))
}

function toggleToc(this: HTMLElement) {
  this.classList.toggle("collapsed")
  this.setAttribute(
    "aria-expanded",
    this.getAttribute("aria-expanded") === "true" ? "false" : "true",
  )
  const content = this.nextElementSibling as HTMLElement | undefined
  if (!content) return
  content.classList.toggle("collapsed")
}

function setupToc() {
  for (const toc of document.getElementsByClassName("toc")) {
    const button = toc.querySelector(".toc-header")
    const content = toc.querySelector(".toc-content")
    if (!button || !content) continue
    button.addEventListener("click", toggleToc)
    // @ts-ignore
    window.addCleanup(() => button.removeEventListener("click", toggleToc))
  }
}

document.addEventListener("nav", () => {
  setupToc()
  setupTocHighlighting()
})
