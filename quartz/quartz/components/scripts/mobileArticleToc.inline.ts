import { setupDockedButton } from './dockedButton'
import { showSiteDialog } from './siteDialog'

document.addEventListener('nav', () => {
  const root = document.querySelector<HTMLElement>('[data-mobile-article-toc]')
  if (!root) return
  const article = document.querySelector<HTMLElement>('.center > .article-viewport > article, .center > article')
  if (!article) return
  const controller = new AbortController(), signal = controller.signal
  const compact = matchMedia('(max-width:1199px)')
  const launch = root.querySelector<HTMLButtonElement>('[data-article-toc-open]')!
  const dialog = root.querySelector<HTMLDialogElement>('[data-article-toc-dialog]')!
  const list = root.querySelector<HTMLUListElement>('[data-article-toc-list]')!
  const viewport = dialog.querySelector<HTMLElement>('nav')!
  let headings: HTMLElement[] = [], current = '', frame = 0
  let locked = root.dataset.locked === 'true' && !document.querySelector('.article-title .encrypted-mark[data-lock-state="unlocked"]')
  const dock = setupDockedButton(launch, compact, signal, () => 'quartz-article-toc-position:v1')
  const update = () => {
    frame = 0
    let active = headings[0]?.id || ''
    for (const heading of headings) {
      if (heading.getBoundingClientRect().top <= Math.max(80, innerHeight * .2)) active = heading.id
      else break
    }
    if (active === current) return
    current = active
    for (const link of list.querySelectorAll<HTMLAnchorElement>('a')) {
      if (link.dataset.for === active) link.setAttribute('aria-current', 'location')
      else link.removeAttribute('aria-current')
    }
  }
  const schedule = () => { if (!frame) frame = requestAnimationFrame(update) }
  const build = () => {
    headings = locked ? [] : [...article.querySelectorAll<HTMLElement>('h1[id],h2[id],h3[id],h4[id],h5[id],h6[id]')]
    list.replaceChildren(); current = ''
    const source = new Map([...document.querySelectorAll<HTMLAnchorElement>('.toc a[data-for]')].map(link => [link.dataset.for, link.textContent?.trim()]))
    const base = Math.min(...headings.map(heading => Number(heading.tagName.slice(1))))
    for (const heading of headings) {
      const row = document.createElement('li'), link = document.createElement('a')
      row.style.setProperty('--toc-depth', String(Number(heading.tagName.slice(1)) - base))
      link.href = '#' + encodeURIComponent(heading.id); link.dataset.for = heading.id; link.dataset.noPopover = 'true'
      link.textContent = source.get(heading.id) || heading.textContent?.trim() || '未命名章节'
      link.addEventListener('click', event => {
        event.preventDefault(); event.stopPropagation(); dialog.close()
        history.pushState({}, '', link.href)
        heading.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion:reduce)').matches ? 'auto' : 'smooth' })
      }, { signal })
      row.append(link); list.append(row)
    }
    launch.hidden = !compact.matches || !headings.length
    dock.place(); update()
  }
  launch.addEventListener('click', () => {
    if (dialog.open || !headings.length) return
    update(); showSiteDialog(dialog); launch.setAttribute('aria-expanded', 'true')
    const selected = list.querySelector<HTMLElement>('[aria-current]')
    if (selected) viewport.scrollTop += selected.getBoundingClientRect().top - viewport.getBoundingClientRect().top - (viewport.clientHeight - selected.offsetHeight) / 2
  }, { signal })
  root.querySelector<HTMLButtonElement>('[data-article-toc-close]')!.addEventListener('click', () => dialog.close(), { signal })
  dialog.addEventListener('close', () => { launch.setAttribute('aria-expanded', 'false'); if (document.activeElement === launch) launch.blur() }, { signal })
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return
    const box = dialog.getBoundingClientRect()
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close()
  }, { signal })
  compact.addEventListener('change', () => { if (!compact.matches && dialog.open) dialog.close(); launch.hidden = !compact.matches || !headings.length; dock.place() }, { signal })
  document.addEventListener('decryptComplete', event => { if ((event as CustomEvent).detail?.success) { locked = false; build() } }, { signal })
  addEventListener('scroll', schedule, { passive: true, signal }); addEventListener('resize', schedule, { signal })
  build()
  window.addCleanup(() => { controller.abort(); cancelAnimationFrame(frame); if (dialog.open) dialog.close() })
})
