import {openContentTagDialog} from './contentTagDialog'
import {resetRepoComments,setupRepoComments} from './repoComments'
import {readSiteSession} from './siteSession'
import {readContentCatalog,peekContentCatalog,type IndexedContent} from './contentCatalog'
import {setupDriveContextMenu} from './driveContextMenu'
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
 document.addEventListener('repo-comments-changed',event=>{const slug=(event as CustomEvent).detail?.slug;if(slug===currentSlug()){resetRepoComments();void setupRepoComments(slug.slice(5),signal)}},{signal})
 const currentSlug=()=>{const parts=location.pathname.split('/').filter(Boolean).map(decodeURIComponent);return parts[0]==='Repo'&&parts.length===2?`Repo/${parts[1]}`:parts[0]==='Video'&&/^BV[0-9A-Za-z]{10}$/.test(parts[1]||'')?`Video/${parts[1]}`:''}
 const edit=async(page:IndexedContent)=>{
  if(editing)return;editing=true
  try{
   const state:{id:string;title:string;tags:string[];sourceTags:string[]}=await request('/admin/content-tags?'+new URLSearchParams({id:page.id}))
   if(signal.aborted)return
   const dialog=openContentTagDialog(state.title,state.tags,state.sourceTags,signal,async tags=>{
    const saved=await request('/admin/content-tags',{method:'PUT',body:JSON.stringify({id:state.id,tags})})
    document.dispatchEvent(new CustomEvent('content-tags-changed',{detail:{id:state.id}}))
    await readContentCatalog().catch(()=>undefined)
    if(currentSlug()===page.slug)setPageHeadingTags(document.querySelector('.center')!,saved.tags)
    showPasswordToast('标签已保存')
   })
   dialog.addEventListener('close',()=>{editing=false},{once:true})
  }catch(error){editing=false;if(!signal.aborted)showPasswordToast(error instanceof Error?error.message:'标签读取失败',true)}
 }
 setupDriveContextMenu(document.body,signal,target=>{
  if(!administrator)return
  const card=target.closest('.repo-card,.video-media-card'),direct=target.closest<HTMLAnchorElement>('a[href]'),anchor=card?.querySelector<HTMLAnchorElement>('.repo-card-title>a,.video-media-title')||(direct?.closest('.explorer-content,[data-video-sidebar]')?direct:null)
  let slug=''
  if(anchor){const url=new URL(anchor.href);if(url.origin!==location.origin)return;const parts=url.pathname.split('/').filter(Boolean).map(decodeURIComponent);if(parts.length===2&&['Repo','Video'].includes(parts[0]))slug=parts.join('/')}
  else if(target.closest('.article-title,[data-repo-page]'))slug=currentSlug()
  const page=peekContentCatalog()?.pages[slug];if(!page||!['repo','video'].includes(page.type))return
  const button=node('button','','drive-operation-action is-applicable'),icon=node('span','','drive-operation-icon');icon.innerHTML=homeIcons.tags;button.type='button';button.dataset.operation='edit-content-tags';button.append(icon,node('span','编辑标签'))
  const buttons=[button]
  if(page.type==='repo'){
   const action=node('button','','drive-operation-action is-applicable'),icon=node('span','','drive-operation-icon');icon.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.4 8.4 0 0 1 3.8-.9H13a8.5 8.5 0 0 1 8 8v.5Z"/></svg>';action.type='button';action.dataset.operation='toggle-repo-comments';buttons.push(action)
  }
  let allow=false
  return {name:page.title,buttons,prepare:page.type==='repo'?async()=>{
   try{const value=await request('/repo-comments?'+new URLSearchParams({slug:page.slug}));allow=value.comment!==true;buttons[1].append(node('span',allow?'允许普通用户评论':'禁止普通用户评论'))}
   catch(error){buttons[1].disabled=true;buttons[1].append(node('span','评论权限暂不可用'));if(!signal.aborted)showPasswordToast(error instanceof Error?error.message:'评论权限读取失败',true)}
  }:undefined,execute:async kind=>{
   if(kind==='edit-content-tags'){await edit(page);return}
   try{await request('/admin/repo-comments?'+new URLSearchParams({slug:page.slug}),{method:'PUT',body:JSON.stringify({comment:allow})});showPasswordToast(allow?'已允许普通用户评论':'已禁止普通用户评论');document.dispatchEvent(new CustomEvent('repo-comments-changed',{detail:{slug:page.slug}}))}
   catch(error){if(!signal.aborted)showPasswordToast(error instanceof Error?error.message:'评论权限保存失败',true)}
  }}
 })
})
