const selector = ".center article > .article-ai-summary:not(.popover *) > p"
let previousSummary: { element: HTMLElement; text: string | null } | undefined

document.addEventListener("prenav", () => {
  const element = document.querySelector<HTMLElement>(selector)
  previousSummary = element ? { element, text: element.textContent } : undefined
})

document.addEventListener("nav", () => {
  const summary = document.querySelector<HTMLElement>(selector)
  // SPA navigation can reuse the previous paragraph and its text spans.
  if (summary && previousSummary?.element === summary && previousSummary.text !== summary.textContent) {
    for (const animation of summary.getAnimations({ subtree: true })) {
      if (animation instanceof CSSAnimation && animation.animationName === "quartz-summary-stream") {
        animation.currentTime = 0
        animation.play()
      }
    }
  }
  previousSummary = undefined
})
