import {formatDate} from '../Date'
import type {ValidLocale} from '../../i18n'
import {readContentCatalog,peekContentCatalog,type ContentCatalog} from './contentCatalog'
import {tagHref} from './shareContent'
import {encryptedIcon} from '../../util/encryptedIcon'
import {contentTypeIcons} from '../../util/contentTypeIcons'
document.addEventListener('nav',()=>{
 const roots=[...document.querySelectorAll<HTMLElement>('[data-recent-content]')]
 if(!roots.length)return
 const lifecycle=new AbortController();window.addCleanup(()=>lifecycle.abort())
 const render=({pages,revision}:ContentCatalog)=>{
  if(lifecycle.signal.aborted)return
  const sorted=Object.values(pages).sort((a,b)=>(Date.parse(b.updatedAt||b.createdAt||'')||0)-(Date.parse(a.updatedAt||a.createdAt||'')||0)||a.title.localeCompare(b.title,'zh-CN'))
  for(const root of roots){
   const list=root.querySelector('ul.recent-ul');if(!list||!root.isConnected||root.dataset.recentRevision===revision)continue
   const fragment=document.createDocumentFragment()
   for(const page of sorted.slice(0,Number(root.dataset.recentContent)||5)){
    const row=document.createElement('li');row.className='recent-li'
    const section=document.createElement('div');section.className='section'
    const desc=document.createElement('div');desc.className='desc'
    const title=document.createElement('h3'),link=document.createElement('a');link.href=page.href;link.className='internal'
    if(page.encrypted)link.dataset.noPopover='true'
    else if(page.type==='share')link.dataset.driveHover='true'
    else if(page.type==='repo')link.dataset.repoHover='true'
    else if(page.type==='video')link.dataset.noPopover='true'
    const icon=document.createElement('span');icon.className='recent-content-icon';icon.innerHTML=page.encrypted?encryptedIcon:contentTypeIcons[page.type];link.append(icon,document.createTextNode(page.title))
    const meta=document.createElement('p');meta.className='meta';const time=document.createElement('time');const updated=page.updatedAt||page.createdAt||'';const stamp=Date.parse(updated);if(Number.isFinite(stamp)){time.dateTime=updated;time.textContent=formatDate(new Date(stamp),(root.dataset.recentLocale||'zh-CN') as ValidLocale)}else time.textContent='—';meta.append(time)
    title.append(link);desc.append(title);section.append(desc,meta)
    if(root.dataset.recentTags==='true'&&page.tags.length){const tags=document.createElement('ul');tags.className='tags';for(const tag of page.tags){const item=document.createElement('li'),anchor=document.createElement('a');anchor.className='internal tag-link';anchor.href=tagHref(tag);anchor.textContent=tag;item.append(anchor);tags.append(item)}section.append(tags)}
    row.append(section);fragment.append(row)
   }
   if(!fragment.childNodes.length){const empty=document.createElement('li');empty.textContent='暂无内容';fragment.append(empty)}
   list.replaceChildren(fragment);list.removeAttribute('aria-label');root.setAttribute('aria-busy','false');root.dataset.recentRevision=revision;const more=root.querySelector<HTMLElement>('[data-recent-more]');if(more)more.hidden=sorted.length<=(Number(root.dataset.recentContent)||5)
  }
 }
 const cached=peekContentCatalog();if(cached)render(cached)
 let version=0
 const refresh=async()=>{const own=++version;try{const catalog=await readContentCatalog();if(own===version)render(catalog)}catch{if(lifecycle.signal.aborted||own!==version)return;for(const root of roots){if(root.getAttribute('aria-busy')!=='true')continue;const list=root.querySelector('ul.recent-ul'),message=document.createElement('li');message.textContent='流新暂时无法读取';list?.replaceChildren(message);list?.removeAttribute('aria-label');root.setAttribute('aria-busy','false')}}}
 for(const event of ['content-tags-changed','drive-files-changed','stellar-data-changed'])document.addEventListener(event,()=>void refresh(),{signal:lifecycle.signal})
 void refresh()
})
