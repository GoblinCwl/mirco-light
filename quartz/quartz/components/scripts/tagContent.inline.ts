import {formatDirectoryDate,SITE_DATE_TIME_ZONE} from '../../util/formatDate'
import {showPasswordToast} from './passwordFeedback'
import {setupTagOperations} from './tagOperations'
import {readContentCatalog} from './contentCatalog'
import {homeIcons} from '../../home/icons'
import {contentTypeIcons} from "../../util/contentTypeIcons"
import {attachVideoPreview} from "./videoPreview"
import {drivePassword,driveRoute} from "./driveClient"
import {tagPrefixes,tagHref} from './shareContent'
import {node} from './driveUi'
import {slugTag} from '../../util/path'
import {encryptedIcon} from '../../util/encryptedIcon'
import {collectTagStats,renderTagIndex,renderTagRanking} from '../../util/tagIndex'

// The index shell also serves tags from live shares, Video series and Repo languages.
document.addEventListener('nav',()=>{
 const root=document.querySelector<HTMLElement>('[data-tag-page]')
 if(!root)return
 const lifecycle=new AbortController();let previews:(()=>void)[]=[];window.addCleanup(()=>{lifecycle.abort();for(const dispose of previews)dispose()})
 let requested:string
 try{requested=decodeURIComponent(location.pathname).replace(/^\/tags\/?/,'').replace(/\/$/,'').replace(/\.html$/,'')}
 catch{return}
 const tag=!requested||requested==='index'?'':requested
 const fallback=!root.dataset.tagPage&&Boolean(tag)
 if(fallback){
  const title=`${root.dataset.tagLabel}: ${tag}`,copy=document.querySelector<HTMLElement>('.article-title-copy')
  if(copy){const icon=copy.querySelector('.article-title-link');copy.replaceChildren(document.createTextNode(title));if(icon)copy.append(icon);copy.setAttribute('aria-label',`复制文章链接：${title}`)}
  document.title=`${title} · 微光集`
  root.querySelector('article')?.replaceChildren();root.querySelector('[data-tag-index]')?.remove()
  root.dataset.tagPage=tag;root.classList.remove('tag-index-page');root.classList.add('directory-page')
  root.dataset.tagLoading=''
  const loading=root.querySelector<HTMLElement>('.tag-index-loading');if(loading){loading.className='tag-filter-loading';loading.lastElementChild!.textContent='正在读取项目'}
  const listing=node('div','','page-listing');listing.dataset.tagResults=''
  listing.append(root.querySelector('[data-tag-count]')!);listing.append(root.querySelector<HTMLTemplateElement>('[data-tag-directory-template]')!.content.cloneNode(true));root.append(listing)
  root.querySelector('.tag-index-toolbar')?.remove()
  const breadcrumbs=document.querySelector('.breadcrumb-container')
  if(breadcrumbs){const crumb=node('div','','breadcrumb-element'),separator=node('p',' ❯ '),link=node('a',tag);link.href=tagHref(tag);const last=breadcrumbs.lastElementChild;if(last){last.querySelector('a')?.setAttribute('href','/tags/');last.append(separator)}crumb.append(link);breadcrumbs.append(crumb)}
  root.querySelector<HTMLElement>('[data-tag-count]')!.textContent=''
 }
 if(tag){
  const title=document.querySelector<HTMLElement>('.center .article-title'),back=node('a','全部标签','internal tag-index-return')
  if(title){const heading=node('div','','tag-filter-heading');title.before(heading);back.href='/tags/';back.dataset.noPopover='true';back.insertAdjacentHTML('afterbegin',homeIcons.tags);heading.append(title,back)}
 }
 const sidebar=document.querySelector<HTMLElement>('[data-tag-sidebar]')
 if(tag&&sidebar)setupTagOperations(sidebar,tag,lifecycle.signal)
 let locateTimer:ReturnType<typeof setTimeout>|undefined
 window.addCleanup(()=>clearTimeout(locateTimer))
 const filterTags=()=>{
  const query=root.querySelector<HTMLInputElement>('[data-tag-filter]')?.value.trim().normalize('NFKC').toLocaleLowerCase()||''
  let visible=0
  for(const row of root.querySelectorAll<HTMLElement>('[data-tag-name]')){
   const matches=!query||row.dataset.tagName!.normalize('NFKC').toLocaleLowerCase().includes(query)
   row.dataset.tagMatch=String(matches)
   row.classList.toggle('is-muted',!matches)
   if(matches)visible++
  }
  const status=root.querySelector('[data-tag-visible-count]');if(status)status.textContent=query?`找到 ${visible} 个主题`:`${visible} 个主题`
  const empty=root.querySelector<HTMLElement>('[data-tag-empty-filter]');if(empty)empty.hidden=visible>0
 }
 const locateTag=(entry:HTMLElement)=>{
  for(const previous of root.querySelectorAll('.is-located'))previous.classList.remove('is-located')
  clearTimeout(locateTimer)
  entry.classList.add('is-located')
  entry.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth',block:'center'})
  entry.querySelector<HTMLAnchorElement>('a')?.focus({preventScroll:true})
  locateTimer=setTimeout(()=>entry.classList.remove('is-located'),2000)
 }
 root.querySelector('[data-tag-filter]')?.addEventListener('input',filterTags,{signal:lifecycle.signal})
 root.querySelector('[data-tag-filter]')?.addEventListener('keydown',event=>{
  if((event as KeyboardEvent).key!=='Enter'||(event as KeyboardEvent).isComposing)return
  const first=root.querySelector<HTMLElement>('[data-tag-match="true"]')
  if(first){event.preventDefault();locateTag(first)}
 },{signal:lifecycle.signal})
 if(!tag)document.addEventListener('click',event=>{
  if(event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return
  const link=(event.target as Element).closest<HTMLAnchorElement>('[data-tag-locate]')
  if(!link||!root.contains(link)&&!sidebar?.contains(link))return
  const entry=[...root.querySelectorAll<HTMLElement>('[data-tag-name]')].find(item=>item.dataset.tagName===link.dataset.tagLocate)
  if(!entry)return
  event.preventDefault()
  event.stopPropagation()
  const search=root.querySelector<HTMLInputElement>('[data-tag-filter]');if(search){search.value='';filterTags()}
  locateTag(entry)
 },{signal:lifecycle.signal})
 const template=fallback?root.dataset.tagItemsTemplate!:root.dataset.tagCountTemplate!
 const count=root.querySelector<HTMLElement>('[data-tag-count]')!
 const index=root.querySelector<HTMLElement>('[data-tag-index]')
 index?.setAttribute('aria-busy','true')
 let renderedIndex:string|undefined,renderedRevision:string|undefined
 let refreshing:Promise<void>|undefined,refreshAgain=false
 const refresh=()=>refreshing??=(async()=>{
  const catalog=await readContentCatalog()
  if(lifecycle.signal.aborted||!root.isConnected||refreshAgain||renderedRevision===catalog.revision)return
  root.querySelector('[data-tag-error]')?.remove()
  const indexed=Object.values(catalog.pages)
  const shares=indexed.map(page=>({slug:page.slug,href:page.href,protected:page.encrypted,page}))
  if(!tag){
   const stats=collectTagStats(indexed)
   const html=renderTagIndex(stats)
   if(renderedIndex!==html){index!.innerHTML=html;renderedIndex=html}
   filterTags()
   const ranking=renderTagRanking(stats),rank=sidebar?.querySelector('[data-tag-ranking]')
   if(rank)rank.innerHTML=ranking
   const sourceCounts=['article','share','repo','video'].map(type=>indexed.filter(page=>page.type===type&&page.tags.length).length)
   sidebar?.querySelectorAll<HTMLElement>('[data-tag-source-count]').forEach(element=>{element.textContent=String(sourceCounts[Number(element.dataset.tagSourceCount)])})
   sidebar?.setAttribute('aria-busy','false')
   count.textContent=`${stats.pageCount} 项内容`
   renderedRevision=catalog.revision
   return
  }
  for(const dispose of previews)dispose();previews=[]
  const table=root.querySelector<HTMLTableElement>('[data-tag-results] table[data-directory-list]')!,list=table.tBodies[0]
  list.replaceChildren()
  const matching=shares.filter(share=>tagPrefixes(share.page.tags).includes(slugTag(tag)))
  for(const share of matching){
   const row=node('tr'),kind=node('td','','drive-kind-cell'),icon=node('span','','drive-file-icon');row.dataset.sharePage=share.slug;row.dataset.directoryName=share.page.title;row.dataset.directoryFolder=String(!share.slug.startsWith('Video/'));row.dataset.directoryModified=''
   const isVideo=share.page.type==='video',isRepo=share.page.type==='repo',isArticle=share.page.type==='article'
   if(isRepo||isArticle)row.dataset.directoryFolder='false'
   icon.setAttribute('role','img');icon.setAttribute('aria-label',isVideo?'视频':isRepo?'仓库':isArticle?'文章':'分享目录');icon.innerHTML=contentTypeIcons[share.page.type];kind.append(icon)
   const name=node('td','','drive-name-cell'),entry=node('div','','drive-entry-name'),link=node('a','','internal drive-file-open');link.append(node('span',share.page.title,'drive-file-name'));link.href=share.href;link.dataset.noPopover='true'
   if(isArticle){if(!share.protected)delete link.dataset.noPopover}
   else if(isRepo)link.dataset.repoHover='true'
   else if(isVideo){const video=share.page.extra;if(video.bvid)previews.push(attachVideoPreview(link,video.bvid,video.cover,{anchor:link,duration:video.duration}))}
   else {const route=driveRoute(new URL(share.href,location.origin));if(!share.protected||Boolean(drivePassword('share',route.share,route.path)))link.dataset.driveHover='true'}
   if(share.protected){const lock=node('span','','encrypted-mark');lock.innerHTML=encryptedIcon;lock.setAttribute('aria-label',isArticle?'加密文章':'需要提取码');lock.setAttribute('role','img');entry.append(lock)}
   entry.append(link);name.append(entry)
   const tags=node('td','','drive-tags-cell'),labels=node('ul','','tags directory-tags');labels.title=share.page.tags.map(label=>`#${label}`).join(' · ')
   const first=share.page.tags[0]
   if(first){const item=node('li'),a=node('a',first,'internal tag-link');a.href=tagHref(first);a.dataset.noPopover='true';item.append(a);labels.append(item)}
   if(share.page.tags.length>1){const item=node('li');item.append(node('span',`+${share.page.tags.length-1}`,'directory-tags-more'));labels.append(item)}
   const modified=node('td','—','drive-modified-cell')
   const dateValue=share.page.updatedAt||share.page.createdAt
   const timestamp=Date.parse(dateValue||'')
   if(Number.isFinite(timestamp)){
    const date=new Date(timestamp),time=node('time')
    time.append(node('span',date.toLocaleDateString('zh-CN',{timeZone:SITE_DATE_TIME_ZONE}),'directory-date-full'),node('span',formatDirectoryDate(date),'directory-date-compact'))
    time.dateTime=date.toISOString();time.title=`${isVideo?'发布时间':isRepo?'更新时间':'分享时间'}：${date.toLocaleString('zh-CN')}`
    modified.replaceChildren(time);row.dataset.directoryModified=String(timestamp)
   }
   tags.append(labels);row.append(kind,name,tags,modified);list.append(row)
  }
  table.dispatchEvent(new Event('directory-list-updated',{bubbles:true}))
  count.textContent=template.replace('123456789',String(matching.length))
  renderedRevision=catalog.revision
 })().catch(()=>{
  if(lifecycle.signal.aborted||!root.isConnected||refreshAgain)return
  if(renderedRevision){showPasswordToast('标签内容更新失败，请稍后重试',true);return}
  count.textContent='';index?.replaceChildren()
  sidebar?.querySelector('[data-tag-ranking]')?.replaceChildren()
  sidebar?.querySelectorAll('[data-tag-source-count]').forEach(value=>value.textContent='—')
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
