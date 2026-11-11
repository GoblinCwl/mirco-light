/** Extra iframe canvas for menus, without changing the media size or page flow.
 * Serialized into ordinary previews: keep all runtime dependencies local. */
export function mountPlayerPanels(player:any,root:HTMLElement,channel:string,signal:AbortSignal) {
  const element=player.template.$player as HTMLElement
  let queued=0,last='',offset=0
  const originalMargin=root.style.marginTop
  const panels=()=>[...element.querySelectorAll<HTMLElement>('.art-settings,.apd-config-panel')]
  const update=()=>{
    queued=0
    if(signal.aborted)return
    const settings=element.querySelector<HTMLElement>('.art-settings'),danmaku=element.querySelector<HTMLElement>('.apd-config-panel')
    const active=player.setting.show?settings:element.querySelector('.apd-config.quartz-danmuku-open')?danmaku:null
    const fullscreen=!!(document.fullscreenElement || (document as any).webkitFullscreenElement || player.fullscreenWeb)
    const rect=element.getBoundingClientRect(),bottom=rect.width<600?8:60
    const inner=active?.querySelector<HTMLElement>('.apd-config-panel-inner')
    const height=active?Math.min(420,(inner||active).scrollHeight+2):0
    const menu=active?.getBoundingClientRect()
    const message={channel,type:'playerPanel',open:!!active&&!fullscreen,height,bottom,mediaHeight:Math.round(rect.height),left:Math.max(0,menu?.left??rect.left),width:menu?.width||288}
    const serialized=JSON.stringify(message)
    if(serialized!==last){last=serialized;parent.postMessage(message,'*')}
    if(!active||fullscreen)apply(0,Math.max(80,rect.height-bottom-8))
  }
  const schedule=()=>{if(!queued&&!signal.aborted)queued=requestAnimationFrame(update)}
  const apply=(space:number,maxHeight:number)=>{
    offset=space;root.style.marginTop=space?`${space}px`:originalMargin
    for(const panel of panels()){
      panel.style.setProperty('max-height',`${maxHeight}px`,'important')
      panel.querySelector<HTMLElement>('.apd-config-panel-inner')?.style.setProperty('max-height',`${maxHeight}px`,'important')
    }
  }
  const receive=(event:MessageEvent)=>{
    if(event.source!==parent||event.data?.channel!==channel||event.data?.type!=='playerPanelSpace')return
    const space=Number(event.data.offset),height=Number(event.data.height)
    if(Number.isFinite(space)&&space>=0&&space<=1000&&Number.isFinite(height)&&height>0&&height<=1200)apply(space,height)
  }
  const observer=new MutationObserver(records=>{
    if(records.some(record=>record.target instanceof Element&&record.target.matches('.art-video-player,.art-setting-panel,.apd-config')))schedule()
  })
  observer.observe(element,{subtree:true,attributes:true,attributeFilter:['class']})
  player.on('setting',schedule)
  addEventListener('message',receive,{signal})
  addEventListener('resize',schedule,{signal})
  document.addEventListener('fullscreenchange',schedule,{signal})
  document.addEventListener('webkitfullscreenchange',schedule,{signal})
  signal.addEventListener('abort',()=>{observer.disconnect();cancelAnimationFrame(queued);root.style.marginTop=originalMargin;player.off?.('setting',schedule);if(offset)parent.postMessage({channel,type:'playerPanel',open:false},'*')},{once:true})
}

export function playerPanelBounds(top:number,mediaHeight:number,desired:number,bottom:number,open:boolean) {
  const offset=open?Math.ceil(Math.min(Math.max(0,top-8),Math.max(0,desired+bottom+8-mediaHeight))):0
  return {offset,height:Math.max(60,Math.min(desired||420,mediaHeight+offset-bottom-8))}
}

/** The parent authorizes only its own frame/channel and caps the overlay to the
 * visible viewport. Transparent padding is clipped to the menu's width. */
export function setupPlayerPanelHost(frame:HTMLIFrameElement,channel:string,signal:AbortSignal) {
  let offset=0,pending:any
  const fit=()=>{
    if(!pending||!pending.open&&offset===0)return
    const rect=frame.getBoundingClientRect(),top=rect.top+offset
    const active=pending.open&&!frame.classList.contains('is-web-fullscreen')
    const mediaHeight=Math.max(1,Math.min(5000,Number(pending.mediaHeight)||rect.height-offset))
    const bottom=Math.max(8,Math.min(80,Number(pending.bottom)||60))
    const desired=Math.max(0,Math.min(420,Number(pending.height)||0))
    const bounds=playerPanelBounds(top,mediaHeight,desired,bottom,active)
    offset=bounds.offset
    const height=bounds.height
    const left=Math.max(0,Math.min(rect.width,Number(pending.left)||0)),right=Math.min(rect.width,left+Math.max(0,Number(pending.width)||288))
    frame.classList.toggle('has-player-panel-overflow',offset>0)
    frame.style.setProperty('--drive-menu-offset',`${offset}px`)
    frame.style.setProperty('--drive-menu-clip',`polygon(${left}px 0,${right}px 0,${right}px ${offset}px,100% ${offset}px,100% 100%,0 100%,0 ${offset}px,${left}px ${offset}px)`)
    frame.contentWindow?.postMessage({channel,type:'playerPanelSpace',offset,height},'*')
  }
  addEventListener('message',event=>{
    if(event.source!==frame.contentWindow||event.data?.channel!==channel||event.data?.type!=='playerPanel')return
    pending=event.data;fit()
  },{signal})
  addEventListener('scroll',fit,{signal,passive:true})
  addEventListener('resize',fit,{signal,passive:true})
  signal.addEventListener('abort',()=>frame.classList.remove('has-player-panel-overflow'),{once:true})
}
