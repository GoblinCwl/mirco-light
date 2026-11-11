import {readContentCatalog} from './contentCatalog'
import {resolveRelative,type FullSlug} from '../../util/path'
import {attachVideoPreview,clearVideoPreviews} from './videoPreview'
import {videoHref} from './videoLibrary'
import {repoHref} from './repoShared'
import {driveEntryHref} from './driveEntries'
import {drivePassword} from './driveClient'
import {readDriveShareRoot} from './driveShareSummary'
import {encounterItemsFromIndex,pickEncounterItems,type EncounterItem} from './encounterItems'
import {contentTypeIcons} from '../../util/contentTypeIcons'
const compact=new Intl.NumberFormat('zh-CN',{notation:'compact',maximumFractionDigits:1})
const date=(value:string|null)=>value?new Date(value).toLocaleDateString('zh-CN'):''
const duration=(seconds:number)=>{const n=Math.max(0,Math.round(seconds));return n>=3600?`${Math.floor(n/3600)}:${String(Math.floor(n%3600/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`:`${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`}
document.addEventListener('nav',async()=>{
  const root=document.querySelector<HTMLElement>('.home-encounter');if(!root)return
  const content=root.querySelector<HTMLElement>('.home-encounter-content')!,next=root.querySelector<HTMLButtonElement>('[data-encounter-next]')!,controller=new AbortController(),signal=controller.signal
  let items:EncounterItem[]=[],previous=new Set<string>(),busy=false,animation:Animation|undefined,cleanups:(()=>void)[]=[],version=0,fetchVersion=0
  const reduced=matchMedia('(prefers-reduced-motion: reduce)')
  const clear=()=>{for(const cleanup of cleanups)cleanup();cleanups=[];clearVideoPreviews()}
  window.addCleanup(()=>{controller.abort();animation?.cancel();clear()})
  const create=(item:EncounterItem)=>{
    const box=document.createElement('div'),link=document.createElement('a'),first=document.createElement('p'),second=document.createElement('p')
    box.className=`home-encounter-item home-encounter-${item.kind}`;link.className='home-encounter-link';link.dataset.encounterId=item.id
    const lines=()=>{first.className='home-encounter-meta';second.className='home-encounter-detail';box.append(link,first,second)}
    if(item.kind==='article'){
      link.classList.add('internal');link.href=resolveRelative(document.body.dataset.slug as FullSlug,item.slug);link.textContent=item.title
      first.textContent=item.excerpt;box.append(link,first)
    }else if(item.kind==='share'){
      link.href=driveEntryHref(item.entry);link.textContent=item.entry.title;link.dataset.driveHover='true';link.dataset.noPopover='true';lines()
      const statistics=document.createElement('span'),sharedAt=document.createElement('time')
      statistics.textContent='正在读取目录统计…'
      const stamp=item.entry.sharedAt,valid=stamp&&Number.isFinite(Date.parse(stamp))
      sharedAt.textContent=valid?`分享于 ${date(stamp)}`:'分享时间未设置'
      if(valid){sharedAt.dateTime=stamp;sharedAt.title=`分享于 ${new Date(stamp).toLocaleString('zh-CN')}`}
      first.append(statistics,sharedAt)
      second.textContent=item.entry.tags?.map(tag=>`#${tag}`).join(' · ')||'暂无标签'
      const current=version
      void readDriveShareRoot(item.entry.id,signal).then(summary=>{
        if(signal.aborted||!box.isConnected||current!==version)return
        statistics.textContent=`${summary.directories} 目录 · ${summary.files} 文件`;statistics.title=`${summary.directories} 个目录 · ${summary.files} 个文件`
      }).catch(()=>{if(!signal.aborted&&box.isConnected&&current===version){box.remove();items=items.filter(value=>value.id!==item.id);next.disabled=!items.length;if(!content.children.length)content.textContent='静候下一束微光'}})
    }else if(item.kind==='repo'){
      link.href=repoHref(item.repo.name);link.textContent=item.repo.name;link.dataset.repoHover='true';link.dataset.noPopover='true';lines()
      first.textContent=`${item.repo.language||'其他'} · 更新于 ${date(item.repo.pushed_at)||'未知'}`;second.textContent=item.repo.description?.trim()||'暂无项目简介'
    }else{
      link.href=videoHref(item.video.bvid);link.textContent=item.video.title;link.dataset.noPopover='true';lines()
      first.textContent=[date(item.video.publishedAt),duration(item.video.duration),`${compact.format(item.video.play)} 播放`].filter(Boolean).join(' · ')
      second.textContent=item.video.description?.trim()||'暂无视频简介'
      cleanups.push(attachVideoPreview(link,item.video.bvid,item.video.cover,{anchor:link,duration:item.video.duration}))
    }
    const icon=document.createElement('span');icon.className='home-encounter-kind';icon.setAttribute('aria-hidden','true')
    icon.innerHTML=contentTypeIcons[item.kind]
    link.prepend(icon)
    return box
  }
  async function choose(){
    if(busy||signal.aborted)return
    busy=true;next.disabled=true
    try{
      if(previous.size&&!reduced.matches){animation=content.animate([{opacity:1},{opacity:0}],{duration:120,fill:'forwards'});await animation.finished.catch(()=>{})}
      if(signal.aborted)return
      version++;clear()
      const eligible=items.filter(item=>item.kind!=='share'||!item.entry.protected||Boolean(drivePassword('share',item.entry.id,'/')))
      const selected=pickEncounterItems(eligible,previous);previous=new Set(selected.map(item=>item.id))
      content.replaceChildren(...selected.map(create))
      if(!selected.length)content.textContent='静候下一束微光'
      content.setAttribute('aria-busy','false');animation?.cancel()
      if(!reduced.matches)animation=content.animate([{opacity:0},{opacity:1}],{duration:250})
    }finally{busy=false;next.disabled=items.length<=3}
  }
  next.addEventListener('click',()=>void choose(),{signal})
  const refresh=async()=>{
    const request=++fetchVersion
    try{
      const catalog=await readContentCatalog()
      if(signal.aborted||request!==fetchVersion)return
      items=encounterItemsFromIndex(Object.values(catalog.pages),id=>Boolean(drivePassword('share',id,'/')))
      await choose()
    }catch{if(!signal.aborted&&request===fetchVersion&&!items.length){content.textContent='暂时无法读取拾遗';content.setAttribute('aria-busy','false');next.disabled=true}}
  }
  for(const event of ['drive-auth-change','drive-directory-unlocked','drive-files-changed','stellar-data-changed'])document.addEventListener(event,()=>void refresh(),{signal})
  await refresh()
})
