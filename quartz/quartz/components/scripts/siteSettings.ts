import { rememberNavigationSkeleton } from './navigationSkeleton'
import { navigationIcon } from './navigationIcon'
import { RequestCache, sharedState } from './sharedRequest'
export type SiteSettings = Record<string, string | number | boolean>
const state = sharedState('site-settings:v1', () => ({ current: {} as SiteSettings, requests: new RequestCache<SiteSettings>(5000, 1), listening: false }))
if (typeof document !== 'undefined' && !state.listening) {
 state.listening = true
 document.addEventListener('site-settings-changed', event => {
  const values = (event as CustomEvent<SiteSettings>).detail
  if (values) { state.current = values; state.requests.set('settings', values) }
 })
}
export const siteSettings = () => state.current
export function readSiteSettings(fresh = false): Promise<SiteSettings> {
  return state.requests.read('settings', async signal => {
    const response = await fetch('/api/site/settings', { cache: 'no-store', signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) })
    if (!response.ok) throw new Error('配置暂不可用')
    const result = await response.json(); return result.values || {}
  }, { refresh: fresh }).then(values => { state.current = values; return values }).catch(() => state.current)
}
export async function refreshSiteSettings() {
  state.requests.clear()
  const values = await readSiteSettings(true)
  document.dispatchEvent(new CustomEvent('site-settings-changed', { detail: values }))
}
export function applySiteSettings(values: SiteSettings) {
  const aboutRoute = typeof values['site.aboutRoute'] === 'string' ? values['site.aboutRoute'].trim() : ''
  for (const link of document.querySelectorAll<HTMLAnchorElement>('[data-about-link]')) {
    const enabled = aboutRoute.startsWith('/') && !aboutRoute.startsWith('//')
    link.href = enabled ? aboutRoute : '/about/'
    const path = (value: string) => { try { return decodeURIComponent(new URL(value, location.href).pathname).replace(/\/(?:index(?:\.html)?)?$/, '') } catch { return value } }
    const selected = enabled && path(link.href) === path(location.href)
    link.classList.toggle('active', selected)
    if (selected) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current')
  }
  if(typeof values['profile.avatar']==='string')for(const image of document.querySelectorAll<HTMLImageElement>('.home-profile-avatar'))image.src=values['profile.avatar']
  if(typeof values['site.description']==='string'){
    for(const text of document.querySelectorAll<HTMLElement>('.friends-site-description'))text.textContent=values['site.description']
    for(const button of document.querySelectorAll<HTMLElement>('[data-friends-copy]'))if(button.dataset.friendsCopy?.startsWith('名称：'))button.dataset.friendsCopy=button.dataset.friendsCopy.replace(/简介：[\s\S]*/,`简介：${values['site.description']}`)
    if(document.body.dataset.slug==='index')for(const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="description"],meta[property="og:description"],meta[name="twitter:description"]'))meta.content=values['site.description']
  }
  if(typeof values['navigation.items']==='string'){
    try{
      const links: {label:string;href:string;icon:string;order:number}[]=JSON.parse(values['navigation.items'])
      const visibleLinks=links.filter(link=>!/^\/(friends|observatory)\/?(?:[?#].*)?$/.test(link.href)).sort((a,b)=>a.order-b.order)
      const registrations: {label:string;href:string;icon:string;order:number}[]=JSON.parse(String(values['icp.items']||'[]'))
      registrations.sort((a,b)=>a.order-b.order)
      rememberNavigationSkeleton(visibleLinks,registrations)
      const revision=JSON.stringify([values['navigation.items'],values['icp.items']])
      for(const container of document.querySelectorAll<HTMLElement>('.home-links-toc .toc-content')){
        if(container.dataset.navigation===revision)continue
        const end=container.querySelector('.overflow-end')
        container.replaceChildren()
        for(const link of visibleLinks){
          const anchor=document.createElement('a');anchor.href=link.href;anchor.dataset.noPopover='true'
          if(link.href==='/index.xml'){anchor.dataset.routerIgnore='true';anchor.target='_blank';anchor.rel='noopener noreferrer'}
          if(link.href.startsWith('/'))anchor.className='internal';else{anchor.target='_blank';anchor.rel='noopener noreferrer'}
          const image=document.createElement('span');image.className='home-link-icon';image.setAttribute('aria-hidden','true');image.innerHTML=navigationIcon(link.icon)
          anchor.textContent=link.label
          const row=document.createElement('li');row.append(image,anchor);container.append(row)
        }
        if(registrations.length){const divider=document.createElement('li');divider.className='home-registration-divider';divider.setAttribute('aria-hidden','true');container.append(divider)}
        for(const [index,item] of registrations.entries()) {
          const row=document.createElement('li'),icp=document.createElement('a')
          icp.className='home-icp';row.className=index===0?'home-registration-first':'home-registration-next'
          icp.dataset.noPopover='true';icp.href=item.href;icp.target='_blank';icp.rel='noopener noreferrer'
          if(item.icon){const icon=document.createElement('span');icon.className='home-registration-icon';icon.setAttribute('aria-hidden','true');icon.innerHTML=navigationIcon(item.icon);icp.append(icon)}
          icp.append(document.createTextNode(item.label));row.append(icp);container.append(row)
        }
        if(end)container.append(end);container.dataset.navigation=revision;container.setAttribute('aria-busy','false');container.removeAttribute('aria-label')
      }
    }catch{}
  }

  for (const element of document.querySelectorAll<HTMLElement>('.home-profile-name > span:first-child')) if (typeof values['profile.name'] === 'string') element.textContent = values['profile.name']
  for (const element of document.querySelectorAll<HTMLAnchorElement>('.home-profile-email')) if (typeof values['profile.email'] === 'string') { element.textContent = values['profile.email']; element.href = `mailto:${values['profile.email']}` }
  for (const element of document.querySelectorAll<HTMLAnchorElement>('[data-home-qq-contact]')) {
    if (typeof values['profile.qq'] === 'string') { element.dataset.qq = values['profile.qq']; element.title = `添加 QQ 好友：${values['profile.qq']}`; element.setAttribute("aria-label", element.title) }
    if (typeof values['profile.qqLink'] === 'string') element.href = values['profile.qqLink']
  }
}
