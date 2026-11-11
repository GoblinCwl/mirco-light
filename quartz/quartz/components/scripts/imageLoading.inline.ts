function classifyCommentImage(img: HTMLImageElement) {
  if (!img.closest(".comments-content, #artalk-comments .atk-content")) return
  if (img.hasAttribute("atk-emoticon") || img.classList.contains("comments-emoticon")) return
  img.classList.toggle("comment-large-image", img.naturalWidth > 160 || img.naturalHeight > 160)
}

function addLoadedClass(img: HTMLImageElement) {
  const container = img.parentElement
  if (container?.classList.contains("image-container")) {
    container.classList.add("loaded")
  }
}

function initializeImage(img: HTMLImageElement) {
  if (img.classList.contains("image-loading-initialized")) return

  img.classList.add("image-loading-initialized")

  img.addEventListener("load", () => classifyCommentImage(img))

  if (img.complete && img.naturalWidth > 0) {
    classifyCommentImage(img)
    addLoadedClass(img)
    return
  }

  img.addEventListener("load", () => addLoadedClass(img), { once: true })
  img.addEventListener("error", () => addLoadedClass(img), { once: true })
}

function initImageLoading(root: ParentNode = document) {
  root.querySelectorAll<HTMLImageElement>("img").forEach(initializeImage)
}

const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    mutation.addedNodes.forEach((node) => {
      if (!(node instanceof Element)) return
      if (node instanceof HTMLImageElement) initializeImage(node)
      initImageLoading(node)
    })
  })
})

observer.observe(document.documentElement, { childList: true, subtree: true })
initImageLoading()

document.addEventListener("nav", () => {
  initImageLoading()
})

export default ""
