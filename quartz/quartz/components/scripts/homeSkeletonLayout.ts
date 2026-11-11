// Skeletons use the hidden real components as their layout source. This keeps
// breakpoints, viewport-based spacing and avatar/calendar sizes in one place.
export function setupHomeSkeletonLayout(article: HTMLElement) {
  let disposed = false, ready = false, frame = 0
  const cards = [...article.querySelectorAll<HTMLElement>('[data-home-pending]')]
  const draw = () => {
    frame = 0
    if (disposed || !article.isConnected) return
    for (const card of cards) {
      if (!card.hasAttribute('data-home-pending')) continue
      const overlay = card.querySelector<HTMLElement>(':scope > .home-skeleton')
      if (!overlay) continue
      const base = card.getBoundingClientRect(), shapes = document.createDocumentFragment()
      const box = (x: number, y: number, width: number, height: number, round = false) => {
        if (width <= 0 || height <= 0) return
        const mark = document.createElement('i'); mark.className = 'home-skeleton-mark'
        mark.style.cssText = `left:${x - base.left}px;top:${y - base.top}px;width:${width}px;height:${height}px;${round ? 'border-radius:50%;' : ''}`
        shapes.append(mark)
      }
      const shape = (target: Element | null, kind: 'line' | 'orb' | 'bar' = 'line', fraction = 1) => {
        if (!target) return
        const rect = target.getBoundingClientRect()
        const height = kind === 'line' ? Math.min(rect.height * .6, 18) : rect.height
        box(rect.left, rect.top + (rect.height - height) / 2, rect.width * fraction, height, kind === 'orb')
      }
      const lines = (selector: string, fraction = 1) => card.querySelectorAll(selector).forEach(target => shape(target, 'line', fraction))
      if (card.classList.contains('home-profile-card')) {
        shape(card.querySelector('.home-avatar-orbit'), 'orb')
        lines('.home-profile-name >span:first-child'); lines('.home-profile-email')
        lines('.home-profile-stat >strong'); lines('.home-profile-stat >span')
      } else if (card.hasAttribute('data-home-activity')) {
        lines('.home-activity-title'); lines('[data-activity-current-status]', .65)
        lines('[data-activity-range]'); lines('[data-activity-total]', .65)
        shape(card.querySelector('[data-activity-bar]'), 'bar')
        const list = card.querySelector<HTMLElement>('[data-activity-categories]')
        if (list) {
          const rect = list.getBoundingClientRect(), style = getComputedStyle(list)
          const gapX = parseFloat(style.columnGap) || 0, gapY = parseFloat(style.rowGap) || 0
          const rowHeight = parseFloat(style.gridAutoRows) || 18
          const rows = Math.max(1, Math.round((rect.height + gapY) / (rowHeight + gapY)))
          const columnWidth = (rect.width - gapX) / 2
          for (let row = 0; row < rows; row++) for (let column = 0; column < 2; column++) {
            box(rect.left + column * (columnWidth + gapX), rect.top + row * (rowHeight + gapY) + rowHeight * .25, columnWidth * .85, rowHeight * .5)
          }
        }
      } else if (card.classList.contains('home-star-domains')) {
        lines('.home-star-domains-title button')
        card.querySelectorAll('.home-explore-item').forEach(item => {
          shape(item.querySelector('svg'), 'orb'); shape(item.querySelector('strong')); shape(item.querySelector('span'), 'line', .8)
        })
      } else if (card.hasAttribute('data-home-attendance')) {
        lines('.home-attendance-title button'); lines('[data-attendance-month]')
        lines('.home-attendance-count'); lines('.home-attendance-weekdays >span')
        card.querySelectorAll('.home-attendance-day').forEach(day => {
          const rect = day.getBoundingClientRect(), size = Math.min(24, rect.width * .45, rect.height * .45)
          box(rect.left + (rect.width - size) / 2, rect.top + (rect.height - size) / 2, size, size)
        })
      } else if (card.hasAttribute('data-home-visitors')) {
        lines('.home-visitors-title button'); lines('[data-visitors-range]'); lines('.home-visitor-counts >span')
        const sky = card.querySelector('[data-visitor-sky]')?.getBoundingClientRect()
        if (sky) for (let i = 0; i < 12; i++) {
          const size = i % 3 ? 9 : 15
          box(sky.left + sky.width * (8 + i * 37 % 84) / 100, sky.top + sky.height * (14 + i * 23 % 72) / 100, size, size, true)
        }
      }
      overlay.replaceChildren(shapes)
    }
  }
  const schedule = () => { if (ready && !disposed && !frame) frame = requestAnimationFrame(draw) }
  const observer = new ResizeObserver(schedule)
  observer.observe(article); for (const card of cards) observer.observe(card)
  window.addEventListener('resize', schedule)
  void document.fonts.ready.then(() => {
    if (disposed) return
    frame = requestAnimationFrame(() => {
      ready = true
      try { draw() } finally { article.removeAttribute('data-home-layout-pending') }
    })
  })
  window.addCleanup(() => { disposed = true; observer.disconnect(); cancelAnimationFrame(frame); window.removeEventListener('resize', schedule) })
}
