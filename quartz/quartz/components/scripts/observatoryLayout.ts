// Balance the actual rendered dashboard, including wrapped descriptions and legends.
// Only the desktop overview uses this layout; smaller screens keep normal flow.
export function setupObservatoryLayout(root:HTMLElement,signal:AbortSignal){
 const content=root.querySelector<HTMLElement>('[data-observatory-content]')
 if(!content)return ()=>{}
 const desktop=matchMedia('(min-width:1200px)')
 let frame=0
 const number=(value:string)=>Number.parseFloat(value)||0
 const margins=(style:CSSStyleDeclaration)=>number(style.marginTop)+number(style.marginBottom)
 const outerHeight=(node:HTMLElement)=>node.getBoundingClientRect().height+margins(getComputedStyle(node))
 const fit=()=>{
  frame=0;if(signal.aborted||!desktop.matches)return
  const hero=content.querySelector<HTMLElement>('.observatory-hero'),summary=content.querySelector<HTMLElement>('.observatory-summary'),cards=[...content.querySelectorAll<HTMLElement>('.observatory-chart')]
  if(!hero||!summary||!cards.length)return
  const rows=Math.ceil(cards.length/2),overheads:number[]=[]
  cards.forEach((card,index)=>{
   const style=getComputedStyle(card)
   let overhead=number(style.paddingTop)+number(style.paddingBottom)+number(style.borderTopWidth)+number(style.borderBottomWidth)
   for(const child of card.children){
    if(!(child instanceof HTMLElement))continue
    if(child.classList.contains('observatory-plot'))overhead+=margins(getComputedStyle(child))
    else overhead+=outerHeight(child)
   }
   const row=Math.floor(index/2);overheads[row]=Math.max(overheads[row]||0,overhead)
  })
  const fixed=outerHeight(hero)+outerHeight(summary)+overheads.reduce((sum,n)=>sum+n,0)
  const viewport=document.documentElement.clientHeight
  const pageTitle=document.querySelector<HTMLElement>('#quartz-body > .sidebar.left .page-title')
  const heading=hero.querySelector<HTMLElement>('h2'),sidebar=pageTitle?.closest<HTMLElement>('.sidebar')
  // The host title may sit only 8px above the left site's title.
  const minInset=pageTitle&&heading&&sidebar?Math.max(16,pageTitle.getBoundingClientRect().top-sidebar.getBoundingClientRect().top-(heading.getBoundingClientRect().top-hero.getBoundingClientRect().top)-8):28
  let plot=110,group=24,row=12,inset=minInset
  let extra=viewport-fixed-rows*plot-2*group-Math.max(0,rows-1)*row-2*inset
  if(extra>=0){
   // Grow the plots first, while keeping the two group gaps comfortably bounded.
   plot+=Math.min(70,extra*.55/rows)
   group+=Math.min(32,extra*.18/2)
   row+=Math.min(12,extra*.07/Math.max(1,rows-1))
   // Remaining space surrounds the whole dashboard instead of opening a hole
   // between its sections or accumulating below the last chart.
   inset=Math.max(minInset,(viewport-fixed-rows*plot-2*group-Math.max(0,rows-1)*row)/2)
  }else{
   let needed=-extra
   const shrink=(value:number,min:number,count:number)=>{const reduction=Math.min(value-min,needed/count);needed-=reduction*count;return value-reduction}
   plot=shrink(plot,64,rows)
   inset=shrink(inset,minInset,2)
   group=shrink(group,14,2)
   if(rows>1)row=shrink(row,8,rows-1)
  }
  for(const [name,value]of Object.entries({'plot-height':plot,'group-gap':group,'row-gap':row,'inset':inset})){
   // Round down so fractional grid borders cannot create a one-pixel scrollbar.
   const next=`${Math.floor(value)}px`,key=`--observatory-${name}`
   if(root.style.getPropertyValue(key)!==next)root.style.setProperty(key,next)
  }
 }
 const schedule=()=>{if(!frame&&!signal.aborted)frame=requestAnimationFrame(fit)}
 const observer=new ResizeObserver(schedule);observer.observe(content)
 window.addEventListener('resize',schedule,{signal})
 desktop.addEventListener('change',schedule,{signal})
 // The server skeleton stays measurable but invisible until its first layout
 // uses the loaded fonts. Size it and reveal it within the same task.
 const reveal=()=>{if(signal.aborted)return;fit();root.removeAttribute('data-observatory-layout-pending')}
 if(document.fonts.status==='loaded')reveal()
 else void document.fonts.ready.then(reveal)
 signal.addEventListener('abort',()=>{observer.disconnect();cancelAnimationFrame(frame)},{once:true})
 // Data replaces the skeleton synchronously. Refit in that same render so an
 // intermediate layout cannot be painted before the next animation frame.
 return fit
}
