import {readSiteSession} from './siteSession'
import {searchableTagSelect} from './searchableTagSelect'
import {readContentCatalog,peekContentCatalog,type IndexedContent} from './contentCatalog'
import {setupDriveContextMenu} from './driveContextMenu'
import {driveActionDialog} from './driveActionDialog'
import {showPasswordToast} from './passwordFeedback'
import {setPageHeadingTags} from './pageHeadingTags'
import {node} from './driveUi'
import {homeIcons} from '../../home/icons'

document.addEventListener('nav',()=>{
 if(!document.querySelector('[data-repo-page],[data-video-page]'))return
 const lifecycle=new AbortController(),signal=lifecycle.signal;window.addCleanup(()=>lifecycle.abort())
 let administrator=false,editing=false
 const request=async(path:string,init:RequestInit={})=>{
  const response=await fetch('/api/site'+path,{...init,credentials:'same-origin',cache:'no-store',signal:AbortSignal.any([signal,AbortSignal.timeout(10000)]),headers:{'Content-Type':'application/json'}})
  const value=await response.json();if(!response.ok){if(response.status===401)administrator=false;throw Error(value.error||'请求失败')}return value
 }
 void readSiteSession().then(value=>{if(!signal.aborted)administrator=!!value.authenticated}).catch(()=>{})
 void readContentCatalog().catch(()=>{})
 document.addEventListener('stellar-auth-changed',event=>{administrator=!!(event as CustomEvent).detail?.authenticated},{signal})
 const currentSlug=()=>{const parts=location.pathname.split('/').filter(Boolean).map(decodeURIComponent);return parts[0]==='Repo'&&parts.length===2?`Repo/${parts[1]}`:parts[0]==='Video'&&/^BV[0-9A-Za-z]{10}$/.test(parts[1]||'')?`Video/${parts[1]}`:''}
 const edit=async(page:IndexedContent)=>{
  if(editing)return;editing=true
  try{
   const state:{id:string;title:string;tags:string[];sourceTags:string[]}=await request('/admin/content-tags?'+new URLSearchParams({id:page.id}))
   if(signal.aborted)return
   const ui=driveActionDialog('编辑标签',signal),selected=new Set(state.tags),section=node('section','','drive-share-settings'),chips=node('div','','drive-share-tag-chips'),row=node('div','','drive-share-tag-add'),input=node('input'),add=node('button','添加'),choose=node('select'),label=node('label','已有标签')
   ui.dialog.addEventListener('close',()=>{editing=false},{once:true});ui.submit.textContent='保存';input.placeholder='输入标签';input.maxLength=100;input.setAttribute('aria-label','新标签');add.type='button';choose.setAttribute('aria-label','选择已有标签')
   const choices=[...new Set(Object.values(peekContentCatalog()?.pages||{}).flatMap(item=>item.tags))].sort((a,b)=>a.localeCompare(b,'zh-CN'))
   const render=()=>{chips.replaceChildren(...[...selected].map(tag=>{const button=node('button',tag+' ×');button.type='button';button.setAttribute('aria-label','移除标签 '+tag);button.onclick=()=>{selected.delete(tag);render()};return button}));choose.replaceChildren(new Option('选择已有标签',''),...choices.filter(tag=>!selected.has(tag)).map(tag=>new Option(tag,tag)))}
   const insert=()=>{const tag=input.value.trim();if(!tag)return;if(selected.size>=50){showPasswordToast('最多添加 50 个标签',true);return}selected.add(tag);input.value='';render()}
   add.onclick=insert;input.onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();insert()}};choose.onchange=()=>{if(choose.value){selected.add(choose.value);render()}}
   row.append(input,add);label.append(choose);section.append(chips,label,row);ui.body.append(node('p',state.title,'drive-action-note'),section);render();searchableTagSelect(choose,signal)
   const reset=node('button','恢复默认');reset.type='button';reset.onclick=()=>{selected.clear();for(const tag of state.sourceTags)selected.add(tag);input.value='';render()};ui.cancel.before(reset)
   ui.run(async()=>{
    const tags=[...selected,...(input.value.trim()?[input.value.trim()]:[])]
    const saved=await request('/admin/content-tags',{method:'PUT',body:JSON.stringify({id:state.id,tags})})
    document.dispatchEvent(new CustomEvent('content-tags-changed',{detail:{id:state.id}}))
    await readContentCatalog().catch(()=>undefined)
    if(currentSlug()===page.slug)setPageHeadingTags(document.querySelector('.center')!,saved.tags)
    showPasswordToast('标签已保存')
   })
  }catch(error){editing=false;if(!signal.aborted)showPasswordToast(error instanceof Error?error.message:'标签读取失败',true)}
 }
 setupDriveContextMenu(document.body,signal,target=>{
  if(!administrator)return
  const card=target.closest('.repo-card,.video-media-card'),direct=target.closest<HTMLAnchorElement>('a[href]'),anchor=card?.querySelector<HTMLAnchorElement>('.repo-card-title>a,.video-media-title')||(direct?.closest('.explorer-content,[data-video-sidebar]')?direct:null)
  let slug=''
  if(anchor){const url=new URL(anchor.href);if(url.origin!==location.origin)return;const parts=url.pathname.split('/').filter(Boolean).map(decodeURIComponent);if(parts.length===2&&['Repo','Video'].includes(parts[0]))slug=parts.join('/')}
  else if(target.closest('.article-title'))slug=currentSlug()
  const page=peekContentCatalog()?.pages[slug];if(!page||!['repo','video'].includes(page.type))return
  const button=node('button','','drive-operation-action is-applicable'),icon=node('span','','drive-operation-icon');icon.innerHTML=homeIcons.tags;button.type='button';button.dataset.operation='edit-content-tags';button.append(icon,node('span','编辑标签'))
  return {name:page.title,buttons:[button],execute:()=>edit(page)}
 })
})
