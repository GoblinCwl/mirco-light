// One controller for both platform sidebars, including retained local navigation.
document.addEventListener('nav',()=>{
  const sidebar=document.querySelector<HTMLElement>('.sidebar.right')
  if(!sidebar)return
  const controller=new AbortController(),signal=controller.signal
  const expanded=new WeakSet<HTMLElement>()
  let frame=0
  const update=()=>{
    frame=0
    for(const module of sidebar.querySelectorAll<HTMLElement>('[data-platform-activity]')) {
      const body=module.querySelector<HTMLElement>('.platform-activity-body')!,button=module.querySelector<HTMLButtonElement>('.platform-activity-toggle')!
      const aside=module.closest<HTMLElement>('.repo-aside,.video-sidebar-content')||module.parentElement!
      const viewport=window.visualViewport?.height||window.innerHeight
      const style=getComputedStyle(aside),limit=parseFloat(style.maxHeight)
      const bottom=Math.min(viewport-24,Number.isFinite(limit)?aside.getBoundingClientRect().top+limit-parseFloat(style.paddingBottom||'0'):viewport-24)
      const top=body.getBoundingClientRect().top
      const height=Math.max(0,Math.floor(bottom-top-36))
      const rows=Array.from(body.querySelectorAll<HTMLElement>('.platform-activity >li'))
      for(const row of rows)row.hidden=false
      // Measure the complete list before deciding which whole rows fit.
      const overflow=body.querySelector<HTMLElement>('.platform-activity')!.getBoundingClientRect().height>height
      button.hidden=!overflow
      module.classList.toggle('has-overflow',overflow)
      module.classList.toggle('is-expanded',expanded.has(module)&&overflow)
      body.style.height=overflow?`${height}px`:''
      button.setAttribute('aria-expanded',String(expanded.has(module)&&overflow))
      const label=button.querySelector('span')!,text=expanded.has(module)?'收起':'展开更多'
      if(label.textContent!==text)label.textContent=text
      if(overflow&&!expanded.has(module)) {
        const positions=rows.map(row=>row.getBoundingClientRect().bottom-top)
        rows.forEach((row,index)=>{row.hidden=positions[index]>height})
        body.scrollTop=0
      }
    }
  }
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(update)}
  sidebar.addEventListener('click',event=>{
    const button=(event.target as Element).closest<HTMLButtonElement>('.platform-activity-toggle')
    if(!button)return
    const module=button.closest<HTMLElement>('[data-platform-activity]')!
    if(expanded.has(module))expanded.delete(module);else expanded.add(module)
    update()
  },{signal})
  window.addEventListener('resize',schedule,{signal})
  window.visualViewport?.addEventListener('resize',schedule,{signal})
  sidebar.addEventListener('load',schedule,{signal,capture:true})
  document.fonts?.ready.then(()=>{if(!signal.aborted)schedule()})
  document.fonts?.addEventListener('loadingdone',schedule,{signal})
  const observer=new MutationObserver(schedule);observer.observe(sidebar,{childList:true,subtree:true})
  const resize=new ResizeObserver(schedule);resize.observe(sidebar)
  schedule()
  window.addCleanup(()=>{controller.abort();observer.disconnect();resize.disconnect();cancelAnimationFrame(frame)})
})
