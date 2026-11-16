/** Shared by ordinary and decrypted articles. Read geometry only on layout changes. */
export function setupTocTracking(headers:HTMLElement[],entries:Map<string,HTMLAnchorElement[]>):()=>void {
 const matched=headers.filter(header=>entries.has(header.id))
 if(!matched.length)return ()=>{}
 let positions:{id:string;top:number}[]=[],lastIndex=-1,lastTarget:string|undefined
 let frame:number|undefined,dirty=true,stopped=false,reset=true
 const states=new Map<HTMLAnchorElement,boolean>()
 const apply=(index:number,visible:boolean)=>{
  for(const entry of entries.get(positions[index].id)||[]){
   if(states.get(entry)===visible)continue
   states.set(entry,visible);entry.classList.toggle('in-view',visible)
  }
 }
 const reveal=(entry:HTMLAnchorElement)=>{
  const list=entry.closest<HTMLElement>('.toc-content')
  if(!list||list.scrollHeight<=list.clientHeight)return
  const bounds=entry.getBoundingClientRect(),viewport=list.getBoundingClientRect()
  if(bounds.top>=viewport.top&&bounds.bottom<=viewport.bottom)return
  list.scrollTo({top:Math.max(0,list.scrollTop+bounds.top-viewport.top-(list.clientHeight-bounds.height)/2),behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'})
 }
 const update=()=>{
  frame=undefined
  if(stopped)return
  const scroll=window.scrollY||0
  if(dirty){
   // Batch all layout reads before touching classes; do not alternate reads/writes.
   positions=matched.map(header=>({id:header.id,top:header.getBoundingClientRect().top+scroll})).sort((a,b)=>a.top-b.top)
   dirty=false;reset=true
  }
  const bottom=scroll+window.innerHeight
  let low=0,high=positions.length
  while(low<high){const middle=(low+high)>>>1;if(positions[middle].top<bottom)low=middle+1;else high=middle}
  const next=low-1
  if(reset){for(let i=0;i<positions.length;i++)apply(i,i<=next);reset=false}
  else if(next>lastIndex){for(let i=lastIndex+1;i<=next;i++)apply(i,true)}
  else if(next<lastIndex){for(let i=next+1;i<=lastIndex;i++)apply(i,false)}
  lastIndex=next
  const target=positions[next]?.id
  if(target!==lastTarget){lastTarget=target;if(target)entries.get(target)?.forEach(reveal)}
 }
 const schedule=()=>{if(!stopped&&frame===undefined)frame=requestAnimationFrame(update)}
 const measure=()=>{dirty=true;schedule()}
 window.addEventListener('scroll',schedule,{passive:true})
 window.addEventListener('resize',measure)
 window.addEventListener('hashchange',schedule)
 document.addEventListener('load',measure,true)
 const resized=typeof ResizeObserver==='function'?new ResizeObserver(measure):undefined
 const article=matched[0].closest?.('article')
 if(article)resized?.observe(article)
 document.fonts?.ready.then(()=>{if(!stopped)measure()}).catch(()=>{})
 update()
 return ()=>{
  stopped=true;if(frame!==undefined)cancelAnimationFrame(frame)
  resized?.disconnect()
  window.removeEventListener('scroll',schedule)
  window.removeEventListener('resize',measure)
  window.removeEventListener('hashchange',schedule)
  document.removeEventListener('load',measure,true)
 }
}
