import {setupReadingSpace,setupReadingHorizon} from './readingSpace'
import {readingTimelineTarget,readingTimelineMotion} from './readingTimelinePan'
import {createReadingPrefetch} from './readingPrefetch'
import {readingMonth,readingYears} from './readingTimeline'
import {readContentCatalog} from './contentCatalog'
import {readingExcerpt} from './readingUnlock'
import {resolveReadingExcerpt} from './readingUnlockSource'
import {readingArtwork,readingZipper,readingArtworkLayout,readingCornerMarks} from './readingArtwork'
import {readingBands} from './readingLayout'
import {fileTypeIcons} from '../../util/fileTypeIcons'
import {SITE_DATE_TIME_ZONE} from '../../util/formatDate'
import {node} from './driveUi'
import {readingOpening,readingPreview,readingFillLineCount,readingDestination,readingFolder,type ReadingItem} from './readingView'
import {createInfiniteScroll} from './infiniteScroll'

document.addEventListener('nav',()=>{
 const root=document.querySelector<HTMLElement>('[data-reading-page]');if(!root)return
 const lifecycle=new AbortController(),signal=lifecycle.signal;window.addCleanup(()=>lifecycle.abort())
 setupReadingSpace(root,signal)
 setupReadingHorizon(root,signal)
 const list=root.querySelector<HTMLElement>('[data-reading-list]')!,status=root.querySelector<HTMLElement>('[data-reading-status]')!,sentinel=root.querySelector<HTMLElement>('[data-reading-sentinel]')!
 let page=0,pages=1,busy=false,lastSuccess=true,jumpingMonth='',jumpVersion=0,activeMonth='',pinnedMonth=''
 let pendingLoad:Promise<void>=Promise.resolve()
 const timeline=root.querySelector<HTMLElement>('[data-reading-timeline]')!,months=new Set<string>()
 let timelinePanFrame=0,timelinePanTarget=0,timelinePanPosition=0,timelinePanTime=0,timelinePanVelocity=0
 const stopTimelinePan=()=>{cancelAnimationFrame(timelinePanFrame);timelinePanFrame=0;timelinePanVelocity=0}
 const panTimeline=(now:number)=>{
  if(signal.aborted)return
  const motion=readingTimelineMotion(timelinePanPosition,timelinePanVelocity,timelinePanTarget,now-timelinePanTime)
  timelinePanPosition=motion.position;timelinePanVelocity=motion.velocity
  timelinePanTime=now
  // Fractional progress is retained even if this frame rounds to the same physical pixel.
  timeline.scrollTop=timelinePanPosition
  if(Math.abs(timelinePanTarget-timelinePanPosition)<.1&&Math.abs(timelinePanVelocity)<1){timeline.scrollTop=timelinePanTarget;timelinePanFrame=0;timelinePanVelocity=0;return}
  timelinePanFrame=requestAnimationFrame(panTimeline)
 }
 const moveTimeline=(event:PointerEvent)=>{
  if(event.pointerType==='touch'||matchMedia('(max-width:800px)').matches||timeline.scrollHeight<=timeline.clientHeight){stopTimelinePan();return}
  const box=timeline.getBoundingClientRect()
  timelinePanTarget=readingTimelineTarget(event.clientY-box.top,box.height,timeline.scrollHeight-timeline.clientHeight)
  if(!timelinePanFrame){timelinePanPosition=timeline.scrollTop;timelinePanTime=performance.now();timelinePanFrame=requestAnimationFrame(panTimeline)}
 }
 timeline.addEventListener('pointerenter',moveTimeline,{passive:true,signal})
 timeline.addEventListener('pointermove',moveTimeline,{passive:true,signal})
 timeline.addEventListener('pointerleave',()=>{
  if(timelinePanFrame)timelinePanTarget=Math.max(0,Math.min(timeline.scrollHeight-timeline.clientHeight,timelinePanPosition+timelinePanVelocity/12))
 },{signal})
 timeline.addEventListener('pointerdown',stopTimelinePan,{signal})
 timeline.addEventListener('wheel',stopTimelinePan,{passive:true,signal})
 window.addEventListener('resize',stopTimelinePan,{signal})
 signal.addEventListener('abort',stopTimelinePan,{once:true})
 const fillOpening=(card:HTMLElement)=>{
  const content=card.querySelector<HTMLElement>('.reading-card-content'),opening=card.querySelector<HTMLElement>('.reading-opening'),footer=card.querySelector<HTMLElement>('.reading-card-footer'),heading=card.querySelector<HTMLElement>('h2')
  if(!content||!opening||!footer||!heading)return
  if(matchMedia('(max-width:800px)').matches){opening.style.setProperty('--reading-visible-lines','7');return}
  const css=getComputedStyle(content),headingCSS=getComputedStyle(heading),openingCSS=getComputedStyle(opening),px=(value:string)=>parseFloat(value)||0
  const available=content.clientHeight-px(css.paddingTop)-px(css.paddingBottom)-heading.offsetHeight-px(headingCSS.marginTop)-px(headingCSS.marginBottom)-footer.offsetHeight-px(openingCSS.marginTop)-px(openingCSS.marginBottom)
  const lines=readingFillLineCount(available,px(openingCSS.lineHeight))
  if(lines)opening.style.setProperty('--reading-visible-lines',String(lines))
 }
 const artworkObserver=new ResizeObserver(entries=>{
  for(const entry of entries){if(entry.contentRect.width<=0||entry.contentRect.height<=0)continue
   const card=entry.target as HTMLElement,art=readingArtworkLayout(entry.contentRect.width,entry.contentRect.height,card.dataset.type||'article')
   fillOpening(card)
   card.style.setProperty('--reading-art-width',`${art.width}px`);card.style.setProperty('--reading-art-right',`${art.right}px`);card.style.setProperty('--reading-art-bottom',`${art.bottom}px`);card.style.setProperty('--reading-art-angle',`${art.angle}deg`)
  }
 })
 signal.addEventListener('abort',()=>artworkObserver.disconnect(),{once:true})
 void document.fonts.ready.then(()=>{if(!signal.aborted)for(const card of list.querySelectorAll<HTMLElement>('.reading-sheet'))fillOpening(card)})
 const seen=new Set<string>()
 const tiles:{element:HTMLElement;title:string;opening:string}[]=[]
 const selectMonth=(month:string)=>{
  activeMonth=month
  for(const button of timeline.querySelectorAll<HTMLButtonElement>('[data-reading-month]')){const active=button.dataset.readingMonth===month;button.classList.toggle('is-active',active);if(active)button.setAttribute('aria-current','date');else button.removeAttribute('aria-current');if(active&&matchMedia('(max-width:800px)').matches){const box=button.getBoundingClientRect(),bar=timeline.getBoundingClientRect();if(box.left<bar.left||box.right>bar.right)timeline.scrollTo({left:timeline.scrollLeft+box.left-bar.left-(bar.width-box.width)/2,behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'})}}
 }
 const unpin=()=>{pinnedMonth=''}
 window.addEventListener('wheel',unpin,{passive:true,signal})
 window.addEventListener('touchstart',unpin,{passive:true,signal})
 window.addEventListener('pointerdown',unpin,{passive:true,signal})
 window.addEventListener('keydown',event=>{if(['ArrowDown','ArrowUp','PageDown','PageUp','Home','End',' '].includes(event.key))unpin()},{signal})
 const waitForScroll=()=>new Promise<void>(resolve=>{
  let idle:number,limit:number
  const finish=()=>{clearTimeout(idle);clearTimeout(limit);window.removeEventListener('scroll',moving);window.removeEventListener('scrollend',finish);signal.removeEventListener('abort',finish);resolve()}
  const moving=()=>{clearTimeout(idle);idle=window.setTimeout(finish,140)}
  window.addEventListener('scroll',moving,{passive:true});window.addEventListener('scrollend',finish,{once:true});signal.addEventListener('abort',finish,{once:true})
  idle=window.setTimeout(finish,200);limit=window.setTimeout(finish,1800)
 })
 const jump=async(month:string)=>{
  const version=++jumpVersion;jumpingMonth=month;pinnedMonth=month;scroll.setEnabled(false);timeline.setAttribute('aria-busy','true');selectMonth(month)
  const target=()=>tiles.filter(tile=>tile.element.dataset.month===month).map(tile=>tile.element).sort((a,b)=>a.getBoundingClientRect().top-b.getBoundingClientRect().top)[0]
  try{
   while(!target()&&!signal.aborted&&version===jumpVersion){
    if(busy){await pendingLoad;continue}
    if(page>=pages)break
    const previous=page;await load();if(previous===page)break
   }
   if(!signal.aborted&&version===jumpVersion){
    await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()))
    if(signal.aborted||version!==jumpVersion)return
    const destination=target()
    if(destination){const settled=waitForScroll();destination.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'});await settled}
    if(!signal.aborted&&version===jumpVersion&&pinnedMonth===month)selectMonth(month)
   }
  }finally{if(version===jumpVersion){jumpingMonth='';timeline.removeAttribute('aria-busy');scroll.setEnabled(lastSuccess&&page<pages)}}
 }
 const renderTimeline=()=>{
  const fragment=document.createDocumentFragment()
  for(const group of readingYears(months)){const section=node('section'),year=node('h2',group.year),items=node('div','','reading-timeline-months');section.append(year,items)
   for(const month of group.months){const button=node('button',`${Number(month.slice(5))}月`);button.type='button';button.dataset.readingMonth=month;button.setAttribute('aria-label',`${group.year}年${Number(month.slice(5))}月`);button.onclick=()=>void jump(month);items.append(button)}
   fragment.append(section)
  }
  timeline.replaceChildren(fragment);selectMonth(activeMonth||[...months].sort().reverse()[0]||'')
 }
 const observer=new IntersectionObserver(entries=>{
  if(jumpingMonth||pinnedMonth)return
  const visible=entries.filter(entry=>entry.isIntersecting).sort((a,b)=>a.boundingClientRect.top-b.boundingClientRect.top)
  const month=(visible[0]?.target as HTMLElement|undefined)?.dataset.month;if(month)selectMonth(month)
 },{rootMargin:'-10% 0px -65% 0px',threshold:0})
 signal.addEventListener('abort',()=>{++jumpVersion;observer.disconnect()},{once:true})
 void readContentCatalog({signal}).then(catalog=>{
  if(signal.aborted)return
  for(const item of Object.values(catalog.pages)){
   const preview={...item,createdAt:item.createdAt||null,excerpt:item.description||''} as ReadingItem
   if(readingExcerpt(preview)===null)continue
   const month=readingMonth(item.updatedAt||item.createdAt);if(month)months.add(month)
  }
  renderTimeline()
 }).catch(()=>{})
 const entranceAnimations=new Set<Animation>()
 signal.addEventListener('abort',()=>{for(const animation of entranceAnimations)animation.cancel();entranceAnimations.clear()},{once:true})
 type Tile=typeof tiles[number]
 const arrangeBatch=(batchTiles:Tile[])=>{
  const fragment=document.createDocumentFragment()
  for(const group of readingBands(batchTiles)){
   const band=node('div','','reading-band');band.style.setProperty('--reading-split',`${group.left}%`)
   if(group.cells)band.dataset.mosaic='true'
   if(group.tall!==undefined)band.dataset.stacked='true'
   if(group.indices.length===1)band.dataset.single='true'
   const tallLeft=group.tallLeft??group.tall===group.indices[0];let short=0
   for(const index of group.indices){const tile=batchTiles[index];tile.element.removeAttribute('data-shape');tile.element.style.removeProperty('grid-area');tile.element.style.removeProperty('--reading-lines')
    const cell=group.cells?.find(cell=>cell.index===index)
    if(cell){tile.element.style.gridArea=`${cell.row} / ${cell.column} / span ${cell.height} / span ${cell.width}`;tile.element.style.setProperty('--reading-lines',String(cell.lines));if(cell.height>1)tile.element.dataset.shape='vertical'}
    else if(group.tall!==undefined){if(index===group.tall){tile.element.dataset.shape='vertical';tile.element.style.setProperty('--reading-lines',String(group.lines||10));tile.element.style.gridArea=`1 / ${tallLeft?1:2} / ${group.indices.length} / ${tallLeft?2:3}`}
    else{tile.element.style.gridArea=`${++short} / ${tallLeft?2:1} / ${short+1} / ${tallLeft?3:2}`}}
    band.append(tile.element)
   }
   fragment.append(band)
  }
  const batch=node('div','','reading-batch');batch.append(fragment);return batch
 }
 const card=(item:ReadingItem,excerpt:string)=>{
  const sheet=node('article','','reading-sheet'),title=node('h2'),link=node('a',item.title)
  link.href=readingDestination(item.href);link.dataset.noPopover='true'
  const types={article:'文章',repo:'仓库',share:'分享',video:'视频'}
  const month=readingMonth(item.updatedAt||item.createdAt);if(month){sheet.dataset.month=month;months.add(month)}
  const phase=Array.from(item.id).reduce((hash,char)=>Math.imul(hash^char.charCodeAt(0),31),7)>>>0
  sheet.style.setProperty('--reading-drift-time',`${14+phase%11}s`);sheet.style.setProperty('--reading-drift-delay',`-${phase%29}s`);sheet.style.setProperty('--reading-drift-x',`${phase%2?6:-6}px`);sheet.style.setProperty('--reading-drift-angle',`${phase%2?.5:-.5}deg`)
  sheet.dataset.type=item.type;sheet.setAttribute('aria-label',`${types[item.type]||'内容'}：${item.title}`);title.append(link)
  const watermark=node('span','','reading-watermark');watermark.setAttribute('aria-hidden','true');watermark.innerHTML=readingArtwork[item.type]||readingArtwork.article
  const content=node('div','','reading-card-content')
  sheet.append(watermark,content)
  const corner=node('span','','reading-corner-mark');corner.setAttribute('aria-hidden','true');corner.innerHTML=readingCornerMarks[item.type]||'';sheet.append(corner)
  if(item.type==='repo'){const corners=node('span','','reading-repo-corners');corners.setAttribute('aria-hidden','true');const erosion=node('span','','reading-repo-erosion');erosion.setAttribute('aria-hidden','true');erosion.innerHTML='<svg viewBox="0 0 40 32" fill="none" stroke="currentColor" stroke-width="1" aria-hidden="true"><path d="M40 0v14h-6v6h-6v6H16v6H0"/><path d="M35 0v9h-6v6h-6v6H11v6H0" opacity=".6"/></svg>';const collapse=node('span','','reading-repo-collapse');collapse.setAttribute('aria-hidden','true');collapse.innerHTML='<svg viewBox="0 0 36 24" fill="currentColor" aria-hidden="true"><rect x="3" y="18" width="4" height="4"/><rect x="12" y="12" width="3" height="3"/><rect x="21" y="6" width="4" height="4"/><rect x="29" y="0" width="3" height="3"/><rect x="2" y="7" width="3" height="3" fill="none" stroke="currentColor" stroke-width=".7"/></svg>';sheet.append(corners,erosion,collapse)}
  if(item.type==='share'){const zipper=node('span','','reading-share-zipper');zipper.setAttribute('aria-hidden','true');zipper.innerHTML=readingZipper;sheet.append(zipper)}
  if(item.type==='article'){const fold=node('span','','reading-page-fold');fold.setAttribute('aria-hidden','true');fold.innerHTML='<svg viewBox="0 0 18 18" aria-hidden="true"><path class="reading-fold-under" d="M0 18 18 0v18H0Z"/><path class="reading-fold-back" d="M0 18V0h18L0 18Z"/><path class="reading-fold-crease" d="M0 18 18 0M0 18V0h18"/></svg>';sheet.append(fold)}
  const text=node('p',readingPreview(excerpt,item.excerptTruncated)||'这是一篇神秘的内容...','reading-opening')
  content.append(title,text)
  const footer=node('footer','','reading-card-footer'),details=node('div','','reading-card-details'),folder=readingFolder(item.href)
  if(folder){const parent=node('a','','reading-folder'),folderIcon=node('span');folderIcon.innerHTML=fileTypeIcons.folder;folderIcon.setAttribute('aria-hidden','true');parent.href=folder.href;parent.dataset.noPopover='true';parent.title=`所属文件夹：${folder.label}`;parent.setAttribute('aria-label',parent.title);parent.append(folderIcon,node('span',folder.label));details.append(parent)}
  const updated=new Date((item.type==='share'?item.createdAt:item.updatedAt)||'')
  if(Number.isFinite(updated.getTime())){
   const time=node('time',`${item.type==='share'?'分享于':'更新于'} ${updated.toLocaleString('zh-CN',{timeZone:SITE_DATE_TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false})}`,'reading-updated')
   time.dateTime=updated.toISOString();time.title=updated.toLocaleString('zh-CN',{timeZone:SITE_DATE_TIME_ZONE})+'（北京时间）';details.append(time)
  }
  const full=node('a','前往内容','reading-full-link'),arrow=node('span');arrow.setAttribute('aria-hidden','true');arrow.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14m-5-5 5 5-5 5"/></svg>';full.href=link.href;full.dataset.noPopover='true';full.setAttribute('aria-label',`前往内容：${item.title}`);full.append(arrow);footer.append(details,full);content.append(footer);artworkObserver.observe(sheet)
  return sheet
 }
 type PreparedPage={page:number;pages:number;batch:HTMLElement;continuation:HTMLElement|null;tiles:Tile[]}
 // Prepare one page, but only its first three cards reserve height before reveal.
 const pageBuffer=createReadingPrefetch<PreparedPage>(async nextPage=>{
   const response=await fetch(`/api/site/content/reading?page=${nextPage}`,{signal:AbortSignal.any([signal,AbortSignal.timeout(12000)]),cache:'no-store'})
   if(!response.ok)throw Error('读取失败')
   const data:{items:ReadingItem[];page:number;pages:number;counts:Record<string,number>}=await response.json()
   if(signal.aborted)throw signal.reason
   for(const counter of root.querySelectorAll<HTMLElement>('[data-reading-count]')){
    const count=data.counts?.[counter.dataset.readingCount!]??0
    counter.textContent=new Intl.NumberFormat('zh-CN').format(count);counter.setAttribute('aria-label',`${counter.dataset.readingCount==='article'?'文章':counter.dataset.readingCount==='repo'?'仓库':counter.dataset.readingCount==='share'?'分享':'视频'}总量 ${count}`)
   }
   const excerpts=await Promise.all(data.items.map(item=>resolveReadingExcerpt(item,signal)))
   if(signal.aborted)throw signal.reason
   const batchTiles:Tile[]=[],batchIds=new Set<string>()
   for(const [index,item] of data.items.entries()){
    const excerpt=excerpts[index];if(excerpt===null||seen.has(item.id)||batchIds.has(item.id))continue
    batchIds.add(item.id);const element=card(item,excerpt);element.dataset.readingId=item.id
    batchTiles.push({element,title:item.title,opening:readingOpening(excerpt)})
   }
   const reserved=nextPage===1?batchTiles.length:Math.min(3,batchTiles.length)
   const batch=arrangeBatch(batchTiles.slice(0,reserved)),continuation=reserved<batchTiles.length?arrangeBatch(batchTiles.slice(reserved)):null
   batch.dataset.readingPending='true';batch.inert=true;batch.setAttribute('aria-hidden','true')
   list.append(batch);batch.prepend(sentinel)
   return {page:data.page,pages:data.pages,batch,continuation,tiles:batchTiles}
 })
 const prefetch=()=>pageBuffer.reserve()
 const load=async()=>{
  if(busy||signal.aborted)return
  let finish!:()=>void;pendingLoad=new Promise<void>(resolve=>{finish=resolve})
  busy=true;scroll.setEnabled(false);if(page===0)root.querySelector<HTMLElement>('[data-reading-initial]')!.hidden=false
  status.hidden=page===0;status.setAttribute('aria-label','正在读取内容');list.setAttribute('aria-busy','true')
  root.querySelector('[data-reading-error]')?.remove()
  let success=false
  try{
   const ready=await pageBuffer.take();if(signal.aborted)return
   page=ready.page;pages=ready.pages
   if(ready.continuation)ready.batch.append(ready.continuation)
   // Only reveal reserved cards. Existing nodes, grid tracks, and artwork remain untouched.
   const reduced=matchMedia('(prefers-reduced-motion:reduce)').matches,start=Number(document.timeline.currentTime??performance.now())
   if(!reduced&&!jumpingMonth)for(const [index,tile] of ready.tiles.entries()){
    const animation=tile.element.animate([{visibility:'hidden',translate:'0px 20px',offset:0},{visibility:'visible',translate:'0px 20px',offset:.001},{visibility:'visible',translate:'0px 0px',offset:1}],{duration:520,delay:Math.min(120,index*20),fill:'backwards',easing:'cubic-bezier(.22,.75,.25,1)'})
    animation.startTime=start;entranceAnimations.add(animation);animation.finished.catch(()=>{}).finally(()=>entranceAnimations.delete(animation))
   }
   ready.batch.removeAttribute('data-reading-pending');ready.batch.inert=false;ready.batch.removeAttribute('aria-hidden')
   for(const tile of ready.tiles){seen.add(tile.element.dataset.readingId!);tiles.push(tile);observer.observe(tile.element)}
   status.after(sentinel);renderTimeline()
   if(!seen.size&&page>=pages)list.append(node('p','暂无可阅读的内容','reading-empty'))
   success=true
  }catch{
   if(signal.aborted)return
   const errorBox=node('div','','reading-error');errorBox.dataset.readingError='';errorBox.setAttribute('role','status')
   const retry=node('button','重试');retry.type='button';retry.onclick=()=>void load();errorBox.append(node('span','内容暂时无法读取'),retry);list.after(errorBox)
  }finally{
   busy=false;status.hidden=true;root.querySelector<HTMLElement>('[data-reading-initial]')!.hidden=true;list.setAttribute('aria-busy','false')
   lastSuccess=success;finish()
   if(!signal.aborted){
    if(success&&page<pages)void prefetch().catch(()=>{})
    scroll.setEnabled(success&&page<pages&&!jumpingMonth)
   }
  }
 }
 const scroll=createInfiniteScroll(sentinel,load,{signal,loadWhenPast:true})
 void load()
})
