type Trail = { keys:string[]; left:number }
let previous:Trail|undefined, current:HTMLElement|undefined, observer:MutationObserver|undefined, sizes:ResizeObserver|undefined
let frame=0, motion=0, cleanup:(()=>void)|undefined
const reduced=matchMedia('(prefers-reduced-motion: reduce)')
const items=(trail:HTMLElement)=>Array.from(trail.querySelectorAll<HTMLElement>(':scope > .breadcrumb-element'))
function keys(trail:HTMLElement){return items(trail).map(item=>{
  const link=item.querySelector('a');let path=''
  try{path=decodeURIComponent(new URL(link?.getAttribute('href')||location.href,location.href).pathname).replace(/(?:\/index)?(?:\.html)?\/$|\.html$|\/index$/g,'')}catch{}
  return `${path}|${link?.textContent?.trim()||item.textContent?.trim()}`
})}
const equal=(a:string[],b:string[])=>a.length===b.length&&a.every((key,index)=>key===b[index])
function stop(){cancelAnimationFrame(motion);motion=0}
function detach(){cancelAnimationFrame(frame);stop();observer?.disconnect();sizes?.disconnect();cleanup?.();current=undefined}
document.addEventListener('prenav',()=>{
  previous=current?.isConnected?{keys:keys(current),left:current.scrollLeft}:undefined
  detach()
})
document.addEventListener('nav',()=>{
  detach()
  const trail=document.querySelector<HTMLElement>('.center .breadcrumb-container');if(!trail){previous=undefined;return}
  current=trail
  let state:Trail|undefined,width=0,contentWidth=0,followTail=true
  const animations=new Set<Animation>()
  const fade=()=>{trail.toggleAttribute('data-breadcrumb-clipped',trail.scrollLeft>1)}
  const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(update)}
  const cancel=()=>{stop();animations.forEach(animation=>animation.cancel());animations.clear()}
  const update=()=>{
    frame=0
    if(!trail.isConnected||!trail.clientWidth||getComputedStyle(trail).visibility==='hidden')return
    const next=keys(trail);if(!next.length)return
    const changed=!state||!equal(state.keys,next),resized=width!==trail.clientWidth||contentWidth!==trail.scrollWidth
    width=trail.clientWidth;contentWidth=trail.scrollWidth
    if(!changed){if(resized&&!motion&&followTail)trail.scrollLeft=Math.max(0,contentWidth-width);fade();return}
    const before=state||previous, appended=!!before&&next.length>before.keys.length&&before.keys.every((key,index)=>key===next[index])
    cancel();state={keys:next,left:trail.scrollLeft};previous=undefined;followTail=true
    sizes?.disconnect();sizes?.observe(trail);items(trail).forEach(item=>sizes?.observe(item))
    const end=Math.max(0,contentWidth-width)
    if(appended&&!reduced.matches){
      const start=Math.max(0,Math.min(before!.left,end));trail.scrollLeft=start
      items(trail).slice(before!.keys.length).forEach((item,index)=>{
        const animation=item.animate([{opacity:0,transform:'translateX(12px)'},{opacity:1,transform:'translateX(0)'}],{duration:360,delay:Math.min(index*35,105),easing:'cubic-bezier(.22,.61,.36,1)'})
        animations.add(animation);animation.onfinish=()=>animations.delete(animation)
      })
      if(Math.abs(end-start)>1){
        const began=performance.now()
        const tick=(now:number)=>{
          const progress=Math.min(1,(now-began)/420),target=Math.max(0,trail.scrollWidth-trail.clientWidth)
          trail.scrollLeft=start+(target-start)*(1-Math.pow(1-progress,3));state!.left=trail.scrollLeft;fade()
          if(progress<1)motion=requestAnimationFrame(tick);else{motion=0;followTail=true}
        }
        motion=requestAnimationFrame(tick)
      }
    }else trail.scrollLeft=end
    state.left=trail.scrollLeft;fade()
  }
  const scroll=()=>{if(state)state.left=trail.scrollLeft;if(!motion)followTail=trail.scrollWidth-trail.clientWidth-trail.scrollLeft<2;fade()}
  const interrupt=()=>{cancel();followTail=false}
  trail.addEventListener('scroll',scroll,{passive:true});trail.addEventListener('wheel',interrupt,{passive:true});trail.addEventListener('pointerdown',interrupt)
  observer=new MutationObserver(schedule);observer.observe(trail,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['data-drive-breadcrumb-ready','data-drive-breadcrumb-retained']})
  sizes=new ResizeObserver(schedule);sizes.observe(trail)
  cleanup=()=>{cancel();trail.removeEventListener('scroll',scroll);trail.removeEventListener('wheel',interrupt);trail.removeEventListener('pointerdown',interrupt)}
  schedule()
})

export {}
