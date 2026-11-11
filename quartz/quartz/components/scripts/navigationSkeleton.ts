// Only public labels and icon presence are cached, never credentials or link targets.
export function rememberNavigationSkeleton(links: {label:string}[], registrations: {label:string;icon:string}[]) {
  try {
    localStorage.setItem('quartz-navigation-layout:v1', JSON.stringify({
      links: links.map(item => item.label),
      registrations: registrations.map(item => ({label:item.label,icon:Boolean(item.icon)})),
    }))
  } catch { /* Storage can be unavailable in private browsing. */ }
}

// Self-contained so the same function can run while parsing the static homepage,
// before its first paint, and on later SPA navigation.
export function restoreNavigationSkeleton(container: HTMLElement | null) {
  if (!container || container.getAttribute('aria-busy') !== 'true') return
  try {
    const raw = localStorage.getItem('quartz-navigation-layout:v1')
    if (!raw || raw.length > 20000) return
    const layout = JSON.parse(raw)
    if (!Array.isArray(layout.links) || layout.links.length > 60 || !layout.links.every((value: unknown) => typeof value === 'string' && value.length <= 100) ||
        !Array.isArray(layout.registrations) || layout.registrations.length > 60 ||
        !layout.registrations.every((item: {label: unknown;icon: unknown}) => item && typeof item.label === 'string' && item.label.length <= 100 && typeof item.icon === 'boolean')) return
    const fragment = document.createDocumentFragment()
    for (const text of layout.links) {
      const row = document.createElement('li'), icon = document.createElement('span'), bar = document.createElement('span'), name = document.createElement('span')
      row.setAttribute('aria-hidden','true'); icon.className='home-link-icon';bar.className='home-navigation-skeleton-icon'
      name.className='home-navigation-placeholder-label';name.textContent=text;icon.append(bar);row.append(icon,name);fragment.append(row)
    }
    if (layout.registrations.length) {
      const divider=document.createElement('li');divider.className='home-registration-divider';divider.setAttribute('aria-hidden','true');fragment.append(divider)
    }
    for (const [index,item] of layout.registrations.entries()) {
      const row=document.createElement('li'), name=document.createElement('span')
      row.setAttribute('aria-hidden','true');row.className=index===0?'home-registration-first':'home-registration-next'
      name.className='home-navigation-placeholder-label home-navigation-placeholder-icp';name.textContent=item.label
      if(item.icon){const icon=document.createElement('span');icon.className='home-registration-icon';name.prepend(icon)}
      row.append(name);fragment.append(row)
    }
    const end=container.querySelector('.overflow-end')
    if(end)fragment.append(end)
    container.replaceChildren(fragment)
  } catch { /* A missing/invalid layout keeps the server-rendered fallback. */ }
}
