import { node } from './driveUi'
export type CommentOrder = 'newest' | 'oldest' | 'hot'
export function commentToolbar(onOrder: (order: CommentOrder) => void, hotHint = '按点赞数排序') {
  const element = node('div', '', 'comment-toolbar')
  const count = node('div', '', 'comment-total'), number = node('strong', '—'), label = node('span', '条评论')
  count.setAttribute('aria-live', 'polite'); count.append(number, label)
  const sort = node('div', '', 'comment-sort'); sort.setAttribute('role', 'group'); sort.setAttribute('aria-label', '评论排序')
  const buttons = new Map<CommentOrder, HTMLButtonElement>()
  for (const [order, text] of [['newest', '最新'], ['oldest', '最早'], ['hot', '热门']] as const) {
    const button = node('button', text, 'comment-sort-button'); button.type = 'button'
    button.dataset.commentOrder = order
    if (order === 'hot') button.title = hotHint
    button.onclick = () => { if (button.getAttribute('aria-pressed') !== 'true') onOrder(order) }
    sort.append(button); buttons.set(order, button)
  }
  element.append(count, sort)
  const setOrder = (order: CommentOrder) => buttons.forEach((button, key) => button.setAttribute('aria-pressed', String(key === order)))
  setOrder('newest')
  return { element, setOrder,
    setTotal(total: number | undefined) {
      const value = total === undefined ? '—' : String(Math.max(0, total))
      if (number.textContent !== value) number.textContent = value
    },
    setBusy(busy: boolean) { sort.setAttribute('aria-busy', String(busy)); buttons.forEach(button => button.disabled = busy) },
  }
}
