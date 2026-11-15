import { node } from './driveUi'

// Bilibili stays read-only; Artalk can attach its native voting action.
export function setCommentLikes(header: HTMLElement, likes: number, vote?: { click: () => void; active: boolean; pending: boolean }) {
  const count = Math.max(0, Math.floor(Number(likes) || 0))
  const existing = header.querySelector<HTMLElement>(':scope > .comment-like-count')
  if (!count && !vote) { existing?.remove(); return }
  const tag = vote ? 'button' : 'span'
  const reusable = existing?.tagName.toLowerCase() === tag ? existing : undefined
  if (existing && !reusable) existing.remove()
  const badge = reusable || node(tag, '', 'comment-like-count')
  badge.classList.toggle('comment-like-button', Boolean(vote))
  badge.classList.toggle('is-zero', count === 0)
  if (vote) {
    const button = badge as HTMLButtonElement
    button.type = 'button'
    button.disabled = vote.pending
    button.setAttribute('aria-pressed', String(vote.active))
    button.setAttribute('aria-busy', String(vote.pending))
    button.onclick = event => { event.stopPropagation(); vote.click() }
  }
  const changed = badge.dataset.likes !== String(count)
  badge.dataset.likes = String(count)
  const label = vote ? `${vote.active ? '已点赞' : '点赞'}，${count} 人点赞` : `${count} 人点赞`
  badge.setAttribute('aria-label', label)
  badge.title = label
  if (!changed) return
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  icon.setAttribute('viewBox', '0 0 24 24'); icon.setAttribute('aria-hidden', 'true')
  icon.innerHTML = '<path d="M7 10v10H3V10h4Zm0 0 5-7a3 3 0 0 1 2 4l-1 3h6a2 2 0 0 1 2 2l-2 7a2 2 0 0 1-2 1H7" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>'
  badge.replaceChildren(icon, node('span', String(count)))
  if (!reusable) header.append(badge)
}
