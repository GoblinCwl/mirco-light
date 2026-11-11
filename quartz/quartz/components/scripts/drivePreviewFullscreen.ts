import {lockPageScroll} from './pageScrollLock'
// Keep the iframe in normal flow. Fixed-position iframe fullscreen can leave
// Safari's bottom viewport clipping active even after its CSS is restored.
export function setupPreviewWebFullscreen(frame: HTMLElement, signal: AbortSignal) {
  let restore: (() => void) | undefined
  const clear = () => { restore?.(); restore = undefined }
  signal.addEventListener("abort", clear, { once: true })
  return (active: boolean) => {
    if (active && restore) return
    clear()
    if (!active || signal.aborted) return
    const properties = ["left", "top", "width", "height"]
    const original = properties.map(name => [name, frame.style.getPropertyValue(name), frame.style.getPropertyPriority(name)])
    const unlock=lockPageScroll({reset:true,signal})
    const hidden: Element[] = [], path: HTMLElement[] = []
    let child: Element = frame
    for (let parent = frame.parentElement; parent; parent = parent.parentElement) {
      for (const sibling of parent.children) {
        if (sibling !== child && !sibling.classList.contains("jit-fullscreen-hidden")) {
          sibling.classList.add("jit-fullscreen-hidden"); hidden.push(sibling)
        }
      }
      if (parent === document.body) break
      if (!parent.classList.contains("jit-fullscreen-path")) {
        parent.classList.add("jit-fullscreen-path"); path.push(parent)
      }
      child = parent
    }
    document.body.classList.add("jit-fullscreen-host","drive-web-fullscreen-host")
    const viewport = window.visualViewport
    const fit = () => {
      const height=`${viewport?.height ?? window.innerHeight}px`
      frame.style.width = "100%"
      frame.style.height = height
      document.documentElement.style.setProperty("height",height,"important")
      document.body.style.setProperty("height",height,"important")
    }
    frame.classList.add("is-web-fullscreen")
    fit()
    viewport?.addEventListener("resize", fit)
    viewport?.addEventListener("scroll", fit)
    window.addEventListener("resize", fit)
    restore = () => {
      viewport?.removeEventListener("resize", fit)
      viewport?.removeEventListener("scroll", fit)
      window.removeEventListener("resize", fit)
      frame.classList.remove("is-web-fullscreen")
      document.body.classList.remove("jit-fullscreen-host","drive-web-fullscreen-host")
      for (const element of hidden) element.classList.remove("jit-fullscreen-hidden")
      for (const element of path) element.classList.remove("jit-fullscreen-path")
      for (const [name, value, priority] of original) {
        if (value) frame.style.setProperty(name, value, priority)
        else frame.style.removeProperty(name)
      }
      unlock()
    }
  }
}
