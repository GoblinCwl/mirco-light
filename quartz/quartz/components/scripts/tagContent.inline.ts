import {setupTagProjectDialog} from './tagProjectDialog'
import type {IndexedContent} from './contentCatalog'
import {showPasswordToast} from './passwordFeedback'
import {readContentCatalog} from './contentCatalog'
import {node} from './driveUi'
import {collectTagStats,renderTagIndex,renderTagNavigation} from '../../util/tagIndex'
import {setupTagNebula} from './tagNebula'
import {setupDockedButton} from './dockedButton'
import {showSiteDialog} from './siteDialog'
import {lockPageScroll} from './pageScrollLock'

// All tag links share the galaxy; the query selects a cluster after its index is ready.
document.addEventListener('nav',()=>{
 const root=document.querySelector<HTMLElement>('[data-tag-page]')
 if(!root)return
 const lifecycle=new AbortController();window.addCleanup(()=>lifecycle.abort())
 const sidebar=document.querySelector<HTMLElement>('[data-tag-sidebar]')
 let initialTag=new URL(location.href).searchParams.get('tag')
 let closeTagPanel=()=>{}
 const panel=sidebar?.querySelector<HTMLDialogElement>('[data-tag-panel]'),launch=document.querySelector<HTMLButtonElement>('[data-tag-panel-open]')
 if(panel&&launch){
  const compact=matchMedia('(max-width:1199px)'),signal=lifecycle.signal
  const dock=setupDockedButton(launch,compact,signal,()=> 'quartz-tag-navigation-position:v1')
  let unlock:(()=>void)|undefined
  const release=()=>{unlock?.();unlock=undefined;launch.setAttribute('aria-expanded','false')}
  closeTagPanel=()=>{
   if(!panel.matches(':modal'))return
   const focused=document.activeElement;if(focused instanceof HTMLElement&&panel.contains(focused))focused.blur()
   panel.close();release()
  }
  const sync=()=>{
   closeTagPanel()
   if(compact.matches){if(panel.open)panel.close()}
   else panel.open=true
   dock.place()
  }
  sync();compact.addEventListener('change',sync,{signal})
  launch.addEventListener('click',()=>{
   if(!compact.matches||panel.matches(':modal'))return
   showSiteDialog(panel);unlock=lockPageScroll({signal});launch.setAttribute('aria-expanded','true')
  },{signal})
  panel.querySelector('[data-tag-panel-close]')?.addEventListener('click',closeTagPanel,{signal})
  panel.addEventListener('close',release,{signal})
  panel.addEventListener('click',event=>{
   if(!panel.matches(':modal')||event.target!==panel)return
   const box=panel.getBoundingClientRect()
   if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)closeTagPanel()
  },{signal})
  window.addCleanup(()=>{closeTagPanel();release()})
 }
 let nebula:ReturnType<typeof setupTagNebula>|undefined
 let indexedProjects:IndexedContent[]=[]
 const projectDialog=setupTagProjectDialog(lifecycle.signal,()=>{nebula?.resetFocus();const url=new URL(location.href);url.searchParams.delete('tag');history.replaceState(history.state,'',url)},()=>{
  clearTimeout(locateTimer)
  for(const scope of [root,sidebar])scope?.querySelectorAll('.is-located').forEach(entry=>entry.classList.remove('is-located'))
  nebula?.refresh()
 })
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!projectDialog?.open)nebula?.resetFocus()},{signal:lifecycle.signal})
 window.addCleanup(()=>nebula?.dispose())
 let locateTimer:ReturnType<typeof setTimeout>|undefined
 window.addCleanup(()=>clearTimeout(locateTimer))
 const filterNavigation=()=>{
  const query=sidebar?.querySelector<HTMLInputElement>('[data-tag-navigation-search]')?.value.trim().normalize('NFKC').toLocaleLowerCase()||''
  let visible=0
  sidebar?.querySelectorAll<HTMLAnchorElement>('[data-tag-locate]').forEach(link=>{
   const matches=!query||link.dataset.tagLocate!.normalize('NFKC').toLocaleLowerCase().includes(query)
   link.closest('li')!.hidden=!matches
   if(matches)visible++
  })
  const empty=sidebar?.querySelector<HTMLElement>('[data-tag-navigation-empty]')
  if(empty)empty.hidden=!query||visible>0||sidebar?.getAttribute('aria-busy')==='true'
 }
 sidebar?.querySelector('[data-tag-navigation-search]')?.addEventListener('input',filterNavigation,{signal:lifecycle.signal})
 sidebar?.querySelector('[data-tag-navigation-search]')?.addEventListener('keydown',event=>{
  const key=event as KeyboardEvent
  if(key.key!=='Enter'||key.isComposing)return
  key.preventDefault()
  sidebar?.querySelector<HTMLAnchorElement>('[data-tag-navigation] li:not([hidden]) [data-tag-locate]')?.click()
 },{signal:lifecycle.signal})
 const locateTag=(entry:HTMLElement)=>{
  // Finish the previous close before starting another camera movement. Its
  // cleanup resets the camera and would otherwise cancel this new selection.
  projectDialog.close(true)
  const url=new URL(location.href);url.searchParams.set('tag',entry.dataset.tagName!);history.replaceState(history.state,'',url)
  for(const scope of [root,sidebar])scope?.querySelectorAll('.is-located').forEach(previous=>previous.classList.remove('is-located'))
  clearTimeout(locateTimer)
  nebula?.focus(entry.dataset.tagName!,()=>{
   if(lifecycle.signal.aborted||!entry.isConnected)return
   const link=[...sidebar?.querySelectorAll<HTMLElement>('[data-tag-locate]')??[]].find(item=>item.dataset.tagLocate===entry.dataset.tagName)
   entry.classList.add('is-located');link?.classList.add('is-located')
   // Restart the one-shot halo when the same tag is located again.
   for(const animation of entry.querySelector('.tag-cluster-label')?.getAnimations?.({subtree:true})??[]){
    if('animationName' in animation&&['tag-locate-glow','tag-locate-wave'].includes(String(animation.animationName))){animation.cancel();animation.play()}
   }
   nebula?.refresh()
   projectDialog?.show(entry.dataset.tagName!,indexedProjects,entry.querySelector<HTMLElement>('.tag-cluster-label')!)
   locateTimer=setTimeout(()=>{entry.classList.remove('is-located');link?.classList.remove('is-located');nebula?.refresh()},3600)
  },true)
 }
 document.addEventListener('click',event=>{
  if(event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return
  const link=(event.target as Element).closest<HTMLAnchorElement>('[data-tag-locate],.tag-index-link')
  if(!link||!root.contains(link)&&!sidebar?.contains(link))return
  const entry=[...root.querySelectorAll<HTMLElement>('[data-tag-name]')].find(item=>item.dataset.tagName===(link.dataset.tagLocate||link.closest<HTMLElement>('[data-tag-name]')?.dataset.tagName))
  if(!entry)return
  event.preventDefault()
  event.stopPropagation()
  closeTagPanel();locateTag(entry)
 },{signal:lifecycle.signal})
 const index=root.querySelector<HTMLElement>('[data-tag-index]')
 index?.setAttribute('aria-busy','true')
 let renderedIndex:string|undefined,renderedRevision:string|undefined
 let refreshing:Promise<void>|undefined,refreshAgain=false
 const refresh=()=>refreshing??=(async()=>{
  const catalog=await readContentCatalog()
  if(lifecycle.signal.aborted||!root.isConnected||refreshAgain||renderedRevision===catalog.revision)return
  root.querySelector('[data-tag-error]')?.remove()
  const indexed=Object.values(catalog.pages)
   const selectedTag=new URL(location.href).searchParams.get('tag')
   projectDialog.close(true)
   initialTag??=selectedTag
   indexedProjects=indexed
   const stats=collectTagStats(indexed)
   const html=renderTagIndex(stats)
   nebula?.dispose()
   if(renderedIndex!==html){index!.innerHTML=html;renderedIndex=html}
   nebula=stats.counts.length?setupTagNebula(root,stats):undefined
   const navigation=sidebar?.querySelector('[data-tag-navigation]')
   if(navigation)navigation.innerHTML=renderTagNavigation(stats)
   sidebar?.setAttribute('aria-busy','false')
   filterNavigation()
   renderedRevision=catalog.revision
   if(initialTag){
    const requested=initialTag;initialTag=null
    const entry=[...root.querySelectorAll<HTMLElement>('[data-tag-name]')].find(item=>item.dataset.tagName===requested)
    if(entry)locateTag(entry)
   }
 })().catch(()=>{
  if(lifecycle.signal.aborted||!root.isConnected||refreshAgain)return
  if(renderedRevision){showPasswordToast('标签内容更新失败，请稍后重试',true);return}
  index?.replaceChildren()
  sidebar?.querySelector('[data-tag-navigation]')?.replaceChildren()
  sidebar?.setAttribute('aria-busy','false')
  let error=root.querySelector<HTMLElement>('[data-tag-error]')
  if(!error){error=node('div','','tag-content-error');error.dataset.tagError='';error.setAttribute('role','status');const retry=node('button','重试');retry.type='button';retry.onclick=()=>{root.dataset.tagLoading='';root.setAttribute('aria-busy','true');error!.hidden=true;void refresh()};error.append(node('span','标签内容暂时无法读取'),retry);root.append(error)}
  error.hidden=false
 }).finally(()=>{
  refreshing=undefined
  if(refreshAgain&&!lifecycle.signal.aborted&&root.isConnected){refreshAgain=false;void refresh();return}
  if(!lifecycle.signal.aborted&&root.isConnected){
   delete root.dataset.tagLoading
   root.setAttribute('aria-busy','false')
   index?.setAttribute('aria-busy','false')
  }
 })
 for(const event of ['drive-files-changed','drive-directory-unlocked','drive-auth-change','content-tags-changed'])document.addEventListener(event,()=>{if(refreshing)refreshAgain=true;else void refresh()},{signal:lifecycle.signal})
 void refresh()
})
