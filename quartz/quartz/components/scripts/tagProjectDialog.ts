import {createInfiniteScroll} from './infiniteScroll'
import {attachVideoPreview} from './videoPreview'
import {drivePassword,driveRoute} from './driveClient'
import {setupTagOperations} from './tagOperations'
import {node} from './driveUi'
import {showSiteDialog} from './siteDialog'
import {lockPageScroll} from './pageScrollLock'
import type {IndexedContent} from './contentCatalog'
import {contentTypeIcons} from '../../util/contentTypeIcons'
import {encryptedIcon} from '../../util/encryptedIcon'
import {tagClusterStyle} from '../../util/tagClusters'
import {tagProjects} from '../../util/tagProjects'
import {SITE_DATE_TIME_ZONE} from '../../util/formatDate'

const labels={article:'文章',share:'分享',repo:'仓库',video:'视频'}
export function setupTagProjectDialog(signal:AbortSignal,onClose:()=>void,onDismiss:()=>void) {
 const dialog=node('dialog','','tag-project-dialog'),heading=node('header','','tag-project-heading')
 dialog.id='tag-project-dialog';dialog.tabIndex=-1;dialog.setAttribute('aria-labelledby','tag-project-title')
 const title=node('h2');title.id='tag-project-title'
 const subtitle=node('p','','tag-project-subtitle'),headingText=node('div','','tag-project-heading-text')
 headingText.append(title,subtitle)
 const closeButton=node('button','','tag-project-close');closeButton.type='button';closeButton.setAttribute('aria-label','关闭项目面板')
 closeButton.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>'
 const list=node('ul','','tag-project-list'),operations=node('div','','tag-project-admin'),actions=node('div','','tag-project-actions');operations.hidden=true;actions.append(operations,closeButton);heading.append(headingText,actions);dialog.append(heading,list);document.body.append(dialog)
 let unlock:(()=>void)|undefined,source:HTMLElement|undefined,transition:Animation|undefined,closing=false
 let batch:AbortController|undefined,previews:(()=>void)[]=[],contentMotion:Animation[]=[]
 const clearItems=()=>{batch?.abort();for(const animation of contentMotion)animation.cancel();contentMotion=[];for(const dispose of previews)dispose();previews=[];dialog.querySelectorAll('.popover,.video-hover-preview').forEach(panel=>panel.remove())}
 const reduced=matchMedia('(prefers-reduced-motion:reduce)')
 const originTransform=()=>{
  if(!source?.isConnected)return 'scale(.95)'
  const from=source.getBoundingClientRect(),to=dialog.getBoundingClientRect()
  if(!from.width||!to.width||!to.height)return 'scale(.95)'
  return `translate(${from.left+from.width/2-to.left-to.width/2}px,${from.top+from.height/2-to.top-to.height/2}px) scale(${from.width/to.width},${from.height/to.height})`
 }
 const release=()=>{
  if(!source)return
  clearItems();transition?.cancel();transition=undefined;closing=false
  source?.removeAttribute('data-project-open');source=undefined
  unlock?.();unlock=undefined
  if(!signal.aborted)onClose()
 }
 const close=(instant=false)=>{
  if(!dialog.open||closing&&!instant)return
  const current=getComputedStyle(dialog),from={transform:current.transform,opacity:current.opacity}
  const contentOpacity=[heading,list].map(element=>getComputedStyle(element).opacity)
  onDismiss();transition?.cancel();transition=undefined
  if(instant||reduced.matches){dialog.close();release();return}
  closing=true
  for(const animation of contentMotion)animation.cancel()
  contentMotion=[heading,list].map((element,index)=>element.animate([{opacity:contentOpacity[index]},{opacity:0}],{duration:90,fill:"forwards"}))
  const animation=dialog.animate([from,{transform:originTransform(),opacity:.25}],{duration:150,easing:'cubic-bezier(.4,0,.6,1)',fill:'forwards'})
  transition=animation
  animation.onfinish=()=>{if(transition===animation&&dialog.open){dialog.close();release()}}
 }
 closeButton.addEventListener('click',()=>close(),{signal})
 dialog.addEventListener('cancel',event=>{event.preventDefault();close()},{signal})
 dialog.addEventListener('close',()=>{if(!dialog.open)release()},{signal})
 dialog.addEventListener('click',event=>{
  if(event.target!==dialog)return
  const rect=dialog.getBoundingClientRect()
  if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)close()
 },{signal})
 signal.addEventListener('abort',()=>{clearItems();transition?.cancel();source?.removeAttribute('data-project-open');if(dialog.open)dialog.close();unlock?.();unlock=undefined;dialog.remove()},{once:true})
 return {
  close,
  get open(){return dialog.open},
  show(tag:string,pages:IndexedContent[],origin:HTMLElement){
   if(signal.aborted)return
   // A new selection supersedes an unfinished close; its callback must never
   // close the replacement content or leave the new source label hidden.
   transition?.cancel();transition=undefined;closing=false
   if(dialog.open){source?.removeAttribute('data-project-open');source=origin;source.setAttribute('data-project-open','')}
   const projects=tagProjects(pages,tag)
   title.textContent=tag;subtitle.textContent=`${projects.length} 个项目`
   dialog.style.cssText=tagClusterStyle(tag)
   clearItems();batch=new AbortController()
   const itemSignal=AbortSignal.any([signal,batch.signal])
   setupTagOperations(operations,tag,itemSignal)
   list.replaceChildren();list.scrollTop=0
   const sentinel=node('li','','tag-project-sentinel');sentinel.setAttribute('aria-hidden','true')
   let shown=0,ready=dialog.open
   const appendBatch=()=>{
   const chunk=projects.slice(shown,shown+20);shown+=chunk.length
   for(const project of chunk){
    const row=node('li'),entry=node('div','','tag-project-open'),link=node('a',project.title,'internal tag-project-name'),icon=node('span','','tag-project-type')
    icon.setAttribute('aria-hidden','true');icon.innerHTML=contentTypeIcons[project.type]
    link.href=project.href;link.dataset.noPopover='true'
    if(project.type==='article'){if(!project.encrypted)delete link.dataset.noPopover}
    else if(project.type==='repo')link.dataset.repoHover='true'
    else if(project.type==='video'){if(project.extra.bvid)previews.push(attachVideoPreview(link,project.extra.bvid,project.extra.cover,{anchor:link,duration:project.extra.duration}))}
    else {const route=driveRoute(new URL(project.href,location.origin));if(!project.encrypted||drivePassword('share',route.share,route.path))link.dataset.driveHover='true'}
    const text=node('span','','tag-project-copy'),name=link
    if(project.encrypted){const lock=node('span','','encrypted-mark');lock.innerHTML=encryptedIcon;lock.setAttribute('aria-label',project.type==='article'?'加密文章':'需要提取码');name.prepend(lock)}
    const meta=node('span',labels[project.type],'tag-project-meta'),date=new Date(project.updatedAt||project.createdAt||'')
    if(Number.isFinite(date.getTime())){const time=node('time',date.toLocaleDateString('zh-CN',{timeZone:SITE_DATE_TIME_ZONE}));time.dateTime=date.toISOString();meta.append(document.createTextNode(' · '),time)}
    text.append(name,meta);entry.append(icon,text);row.append(entry);list.insertBefore(row,sentinel)
   }
   more.setEnabled(ready&&shown<projects.length)
   sentinel.hidden=shown>=projects.length
   }
   list.append(sentinel)
   const more=createInfiniteScroll(sentinel,appendBatch,{root:list,signal:itemSignal})
   appendBatch()
   if(!projects.length){const empty=node('li','暂无项目','tag-project-empty');list.append(empty)}
   if(!dialog.open){
    source=origin;showSiteDialog(dialog);unlock=lockPageScroll({signal});dialog.focus({preventScroll:true})
    const from=originTransform();source.setAttribute('data-project-open','')
    if(!reduced.matches){
     contentMotion=[heading,list].map(element=>element.animate([{opacity:0},{opacity:1}],{duration:140,delay:50,fill:"both"}))
     transition=dialog.animate([{transform:from,opacity:.5},{transform:'none',opacity:1}],{duration:220,easing:'cubic-bezier(.2,.8,.2,1)'})
     transition.onfinish=()=>{if(!itemSignal.aborted){ready=true;more.setEnabled(shown<projects.length)}}
    }else{ready=true;more.setEnabled(shown<projects.length)}
   }
  },
 }
}
