// Anchor the first comment slot on short notes; longer lists grow below it.
export function alignCommentLayout(root: HTMLElement) {
  const center = root.closest<HTMLElement>(".center")
  const viewport = center?.querySelector<HTMLElement>(":scope > .article-viewport") ?? center
  const article = viewport?.querySelector<HTMLElement>(":scope > article")
  if (!center || !article || document.body.dataset.slug === "index" || document.body.dataset.slug?.startsWith("Share/")) return () => {}
  center.classList.add("has-bottom-comments")
  let frame = 0, stopped = false
  const number = (value: string) => Number.parseFloat(value) || 0
  const edges = (element: HTMLElement | null) => {
    if (!element || getComputedStyle(element).display === "none") return 0
    const style = getComputedStyle(element)
    return number(style.marginTop) + number(style.marginBottom) + number(style.paddingTop) + number(style.paddingBottom) + number(style.borderTopWidth) + number(style.borderBottomWidth)
  }
  const outer = (element: HTMLElement | null) => {
    if (!element || getComputedStyle(element).display === "none") return 0
    const style = getComputedStyle(element)
    return element.getBoundingClientRect().height + number(style.marginTop) + number(style.marginBottom)
  }
  const update = () => {
    frame = 0
    if (stopped || !root.isConnected) return
    const footer = center.querySelector<HTMLElement>(":scope > .page-footer")
    const absoluteTop = center.getBoundingClientRect().top + window.scrollY
    // Use the same reservation as the first paint. Artalk's loading/login
    // state and the number of comments must never resize the article.
    const style = getComputedStyle(center)
    const commentSlot = number(style.getPropertyValue("--comment-layout-reserve") || style.getPropertyValue("--comment-initial-height"))
    const bottomGap = 24
    const overhead = absoluteTop + edges(center) + edges(article)
      + outer(viewport!.querySelector<HTMLElement>(":scope > .page-header"))
      + outer(viewport!.querySelector<HTMLElement>(":scope > hr")) + edges(footer) + edges(root)
      + commentSlot + bottomGap
    const value = `${Math.ceil(overhead)}px`
    if (center.style.getPropertyValue("--comment-layout-overhead") !== value) center.style.setProperty("--comment-layout-overhead", value)
  }
  const schedule = () => { if (!frame && !stopped) frame = requestAnimationFrame(update) }
  const sizes = new ResizeObserver(schedule)
  const heading = viewport!.querySelector<HTMLElement>(":scope > .page-header")
  if (heading) sizes.observe(heading)
  sizes.observe(root)
  const placement = new MutationObserver(schedule)
  placement.observe(center, { childList: true })
  window.addEventListener("resize", schedule)
  update()
  return () => {
    stopped = true; cancelAnimationFrame(frame); sizes.disconnect(); placement.disconnect()
    window.removeEventListener("resize", schedule)
    center.classList.remove("has-bottom-comments"); center.style.removeProperty("--comment-layout-overhead")
  }
}
