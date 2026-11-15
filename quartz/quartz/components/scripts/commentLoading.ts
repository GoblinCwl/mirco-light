import { node } from './driveUi'

// Shared local loading treatment for Artalk and Bilibili comment lists.
export function commentLoading(stage: HTMLElement) {
  let overlay: HTMLElement | undefined
  const oldMinHeight = stage.style.minHeight, oldOverflowAnchor = stage.style.overflowAnchor
  let active = false, top = 0, height = 0
  const begin = () => {
    if (active) return
    active = true
    const rect = stage.getBoundingClientRect()
    top = rect.top; height = rect.height
    stage.style.minHeight = `${Math.max(144, rect.height)}px`
    stage.style.overflowAnchor = 'none'
    stage.classList.add('comment-load-stage', 'comment-is-loading')
    stage.setAttribute('aria-busy', 'true')
    overlay = node('div', '', 'comment-local-loader')
    overlay.setAttribute('role', 'status')
    overlay.setAttribute('aria-label', '正在加载评论')
    const spinner = node('span', '', 'comment-local-spinner')
    spinner.setAttribute('aria-hidden', 'true'); spinner.append(node('i'))
    overlay.append(spinner, node('span', '正在加载评论'))
    overlay.style.top = `${Math.max(48, Math.min(rect.height / 2, (window.innerHeight - Math.max(0, rect.top)) / 2))}px`
    stage.append(overlay)
  }
  const finish = () => {
    if (!active) return
    active = false
    // New rows are already in place. Keep enough room below the visible toolbar
    // to prevent document-height clamping from sending the user back up the page.
    stage.style.minHeight = height > 0 ? `${Math.max(0, Math.min(height, window.innerHeight - Math.max(0, top)))}px` : oldMinHeight
    overlay?.remove(); overlay = undefined
    stage.classList.remove('comment-is-loading')
    stage.setAttribute('aria-busy', 'false')
    stage.style.overflowAnchor = oldOverflowAnchor
  }
  const dispose = () => {
    overlay?.remove(); overlay = undefined
    stage.style.minHeight = oldMinHeight
    stage.style.overflowAnchor = oldOverflowAnchor
    stage.classList.remove('comment-is-loading', 'comment-load-stage')
    stage.removeAttribute('aria-busy')
    active = false
  }
  return { begin, finish, dispose }
}
