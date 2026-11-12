import {node,fileIcon} from './driveUi'
import {tagHref} from './shareContent'
import {slugTag} from '../../util/path'
import {SITE_DATE_TIME_ZONE} from '../../util/formatDate'

export type ShareHomeEntry = {
 name:string;target:string;tags?:string[];sharedAt?:string
 protectedShare?:boolean;jellyfin?:boolean;unlocked?:boolean
}
export function renderShareHome(container:HTMLElement,entries:ShareHomeEntry[],spaceHref?:string) {
 const fragment=document.createDocumentFragment()
 if(spaceHref){
  const space=node('a','','internal share-home-space');space.href=spaceHref;space.dataset.noPopover='true'
  const text=node('span','','share-home-space-copy');text.append(node('strong','空间'),node('span','管理文件与存储'))
  space.append(fileIcon('space'),text,node('span','管理员','share-home-space-role'),arrow())
  fragment.append(space)
 }
 const section=node('section','','share-home-projects'),heading=node('div','','share-home-heading')
 heading.append(node('h2','分享项目'),node('span',`${entries.length} 个项目`))
 const grid=node('div','','share-home-grid')
 for(const entry of entries){
  const card=node('article','','share-home-card');card.dataset.driveEntry=entry.target
  const top=node('div','','share-home-card-top'),identity=node('span','','share-home-identity')
  identity.append(fileIcon(entry.jellyfin?'video':'share'),node('span',entry.jellyfin?'媒体分享':'文件分享'))
  top.append(identity)
  const title=node('h3'),link=node('a',entry.name,'internal share-home-title')
  link.href=entry.target;link.dataset.noPopover='true';link.dataset.driveHover='true';title.append(link)
  const tags=node('ul','','tags share-home-tags')
  for(const tag of entry.tags||[]){
   const li=node('li'),a=node('a',tag,'internal tag-link');a.href=tagHref(slugTag(tag));a.dataset.noPopover='true';li.append(a);tags.append(li)
  }
  const footer=node('div','','share-home-card-footer'),status=node('span','','share-home-access')
  const locked=entry.protectedShare&&!entry.unlocked
  if(locked){const icon=node('span','','share-home-lock');icon.setAttribute('aria-hidden','true');icon.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>';status.append(icon)}
  status.append(document.createTextNode(locked?'需要提取码':entry.protectedShare?'已解锁':'公开访问'))
  footer.append(status)
  const date=new Date(entry.sharedAt||'')
  if(Number.isFinite(date.getTime())){
   const time=node('time',`分享于 ${date.toLocaleDateString('zh-CN',{timeZone:SITE_DATE_TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'})}`)
   time.dateTime=date.toISOString();footer.append(time)
  }
  const body=node('div','','share-home-card-body');body.append(title);if(entry.tags?.length)body.append(tags)
  card.append(top,body,footer);grid.append(card)
 }
 section.append(heading,grid)
 if(!entries.length)section.append(node('p','暂无分享项目','share-home-empty'))
 fragment.append(section);container.replaceChildren(fragment)
}
function arrow(){
 const icon=node('span','','share-home-space-arrow');icon.setAttribute('aria-hidden','true')
 icon.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14m-5-5 5 5-5 5"/></svg>'
 return icon
}
