import {formatDirectoryDate,SITE_DATE_TIME_ZONE} from '../../util/formatDate'
import {showPasswordToast} from './passwordFeedback'
import {setupTagOperations} from './tagOperations'
import {readContentCatalog} from './contentCatalog'
import {contentTypeIcons} from "../../util/contentTypeIcons"
import {attachVideoPreview} from "./videoPreview"
import {drivePassword,driveRoute} from "./driveClient"
import {tagPrefixes,tagHref} from './shareContent'
import {node} from './driveUi'
import {slugTag} from '../../util/path'
import {encryptedIcon} from '../../util/encryptedIcon'
import {collectTagStats,renderTagIndex,renderTagNavigation} from '../../util/tagIndex'
import {setupTagNebula} from './tagNebula'
import {setupDockedButton} from './dockedButton'
import {showSiteDialog} from './siteDialog'
import {lockPageScroll} from './pageScrollLock'

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
  const loading=root.querySelector<HTMLElement>('.tag-index-loading');if(loading){loading.className='tag-filter-loading';loading.setAttribute('aria-label','正在读取项目');const spinner=node('span','','drive-loading');spinner.append(node('i'));loading.replaceChildren(spinner,node('span','正在读取项目'))}
  const listing=node('div','','page-listing');listing.dataset.tagResults=''
  const count=node('p');count.dataset.tagCount='';listing.append(count);listing.append(root.querySelector<HTMLTemplateElement>('[data-tag-directory-template]')!.content.cloneNode(true));root.append(listing)
  const breadcrumbs=document.querySelector('.breadcrumb-container')
  if(breadcrumbs){const crumb=node('div','','breadcrumb-element'),separator=node('p',' ❯ '),link=node('a',tag);link.href=tagHref(tag);const last=breadcrumbs.lastElementChild;if(last){last.querySelector('a')?.setAttribute('href','/tags/');last.append(separator)}crumb.append(link);breadcrumbs.append(crumb)}
  root.querySelector<HTMLElement>('[data-tag-count]')!.textContent=''
 }
 const sidebar=document.querySelector<HTMLElement>('[data-tag-sidebar]')
 if(tag&&sidebar)setupTagOperations(sidebar,tag,lifecycle.signal)
 let closeTagPanel=()=>{}
 const panel=sidebar?.querySelector<HTMLDialogElement>('[data-tag-panel]'),launch=document.querySelector<HTMLButtonElement>('[data-tag-panel-open]')
 if(!tag&&panel&&launch){
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
  for(const scope of [root,sidebar])scope?.querySelectorAll('.is-located').forEach(previous=>previous.classList.remove('is-located'))
  clearTimeout(locateTimer)
  nebula?.focus(entry.dataset.tagName!,()=>{
   if(lifecycle.signal.aborted||!entry.isConnected)return
   const link=[...sidebar?.querySelectorAll<HTMLElement>('[data-tag-locate]')??[]].find(item=>item.dataset.tagLocate===entry.dataset.tagName)
   entry.classList.add('is-located');link?.classList.add('is-located')
   nebula?.refresh()
   locateTimer=setTimeout(()=>{entry.classList.remove('is-located');link?.classList.remove('is-located');nebula?.refresh()},2200)
  })
 }
 if(!tag)document.addEventListener('click',event=>{
  if(event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return
  const link=(event.target as Element).closest<HTMLAnchorElement>('[data-tag-locate]')
  if(!link||!root.contains(link)&&!sidebar?.contains(link))return
  const entry=[...root.querySelectorAll<HTMLElement>('[data-tag-name]')].find(item=>item.dataset.tagName===link.dataset.tagLocate)
  if(!entry)return
  event.preventDefault()
  event.stopPropagation()
  closeTagPanel();locateTag(entry)
 },{signal:lifecycle.signal})
 const template=fallback?root.dataset.tagItemsTemplate!:root.dataset.tagCountTemplate!
 const count=root.querySelector<HTMLElement>('[data-tag-count]')
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
   nebula?.dispose()
   if(renderedIndex!==html){index!.innerHTML=html;renderedIndex=html}
   nebula=stats.counts.length?setupTagNebula(root,stats):undefined
   const navigation=sidebar?.querySelector('[data-tag-navigation]')
   if(navigation)navigation.innerHTML=renderTagNavigation(stats)
   sidebar?.setAttribute('aria-busy','false')
   filterNavigation()
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
  if(count)count.textContent=template.replace('123456789',String(matching.length))
  renderedRevision=catalog.revision
 })().catch(()=>{
  if(lifecycle.signal.aborted||!root.isConnected||refreshAgain)return
  if(renderedRevision){showPasswordToast('标签内容更新失败，请稍后重试',true);return}
  if(count)count.textContent=''
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
