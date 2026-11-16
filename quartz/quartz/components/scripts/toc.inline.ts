function revealTocEntry(tocEntry: Element) {
  const tocContent = tocEntry.closest(".toc-content") as HTMLElement | null
  if (!tocContent || tocContent.scrollHeight <= tocContent.clientHeight) return

  const entryBounds = tocEntry.getBoundingClientRect()
  const contentBounds = tocContent.getBoundingClientRect()
  if (entryBounds.top >= contentBounds.top && entryBounds.bottom <= contentBounds.bottom) return

  tocContent.scrollTo({
    top: Math.max(
      0,
      tocContent.scrollTop + entryBounds.top - contentBounds.top -
        (tocContent.clientHeight - entryBounds.height) / 2,
    ),
    behavior: "smooth",
  })
}

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

  let animationFrame: number | undefined
  let lastRevealedHeader: string | undefined
  const update = () => {
    animationFrame = undefined
    let latestVisibleHeader: string | undefined

    // Measure every heading before changing any highlight classes. Alternating
    // reads and writes forces repeated style calculation on large articles.
    const states = headers.flatMap((header) => {
      const entries = tocEntries.get(header.id)
      return entries ? [{ id: header.id, entries, isInView: header.getBoundingClientRect().top < window.innerHeight }] : []
    })
    for (const { id, entries, isInView } of states) {
      entries.forEach((entry) => entry.classList.toggle("in-view", isInView))
      if (isInView) latestVisibleHeader = id
    }

    // Reveal one current heading, not every heading passed while reading.
    // Repeated smooth-scroll targets otherwise fight near the end of long TOCs.
    if (latestVisibleHeader !== lastRevealedHeader) {
      lastRevealedHeader = latestVisibleHeader
      if (latestVisibleHeader) tocEntries.get(latestVisibleHeader)?.forEach(revealTocEntry)
    }
  }
  const scheduleUpdate = () => {
    if (animationFrame === undefined) animationFrame = requestAnimationFrame(update)
  }

  window.addEventListener("scroll", scheduleUpdate, { passive: true })
  window.addEventListener("resize", scheduleUpdate)
  window.addEventListener("hashchange", scheduleUpdate)
  update()

  // @ts-ignore
  window.addCleanup(() => {
    if (animationFrame !== undefined) cancelAnimationFrame(animationFrame)
    window.removeEventListener("scroll", scheduleUpdate)
    window.removeEventListener("resize", scheduleUpdate)
    window.removeEventListener("hashchange", scheduleUpdate)
  })
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
