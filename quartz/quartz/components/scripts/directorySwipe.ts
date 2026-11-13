import {lockPageScroll} from './pageScrollLock'
// Non-interactive content can swipe; controls and dedicated interactive surfaces keep their gestures.
export function directorySwipeIntent(dx:number,dy:number):'horizontal'|'vertical'|null {
  const x=Math.abs(dx),y=Math.abs(dy)
  if(x<8&&y<12)return null
  if(y>=12&&y>x*1.35)return 'vertical'
  if(x>=8&&x>=y*.85)return 'horizontal'
  return null
}
export function setupMobileDirectorySwipe(explorer:HTMLElement,signal:AbortSignal) {
  const mobile=matchMedia('(max-width: 800px)')
  let unlock:(()=>void)|undefined,toolbar:HTMLDivElement|undefined,placeholder:HTMLElement|undefined,closeTimer:ReturnType<typeof setTimeout>|undefined,openFrame=0
  const content=explorer.querySelector<HTMLElement>('.explorer-content')
  const menu=()=>explorer.querySelector<HTMLButtonElement>('.mobile-explorer')
  const restoreToolbar=()=>{const button=menu();if(placeholder&&button)placeholder.replaceWith(button);placeholder=undefined;toolbar?.remove();toolbar=undefined}
  const showToolbar=()=>{
    if(toolbar)return
    const content=explorer.querySelector<HTMLElement>('.explorer-content'),button=menu(),home=document.querySelector<HTMLAnchorElement>('.sidebar.left > .page-title >a')
    if(!content||!button)return
    const bounds=button.getBoundingClientRect()
    placeholder=document.createElement('span');placeholder.setAttribute('aria-hidden','true')
    placeholder.style.cssText=`display:block;width:${bounds.width}px;height:${bounds.height}px;flex:none`
    button.before(placeholder)
    toolbar=document.createElement('div');toolbar.className='mobile-directory-heading';toolbar.append(button)
    if(home){const brand=document.createElement('a');brand.href=home.href;brand.textContent=home.textContent;brand.className='mobile-directory-brand internal';brand.dataset.noPopover='true';toolbar.append(brand)}
    content.prepend(toolbar)
  }
  const releaseLock=()=>{
    clearTimeout(closeTimer);closeTimer=undefined
    cancelAnimationFrame(openFrame);openFrame=0
    restoreToolbar();explorer.removeAttribute('data-drawer-active')
    if(content&&typeof content.hidePopover==='function'&&content.matches(':popover-open'))content.hidePopover()
    content?.removeAttribute('popover')
    unlock?.();unlock=undefined
  }
  const prepareOpen=()=>{
    if(!mobile.matches||signal.aborted)return
    clearTimeout(closeTimer);closeTimer=undefined
    explorer.setAttribute('data-drawer-active','');showToolbar()
    if(content&&typeof content.showPopover==='function'){
      content.setAttribute('popover','manual')
      if(!content.matches(':popover-open'))content.showPopover()
    }
    if(!unlock)unlock=lockPageScroll({signal})
  }
  explorer.addEventListener('directory-before-open',event=>{
    const open=(event as CustomEvent<{open?:()=>void}>).detail?.open
    if(!mobile.matches||!open)return
    event.preventDefault()
    prepareOpen()
    explorer.querySelector<HTMLElement>('.explorer-content')?.getBoundingClientRect()
    cancelAnimationFrame(openFrame)
    // Safari needs a painted closed frame after fixed-body locking, not only a layout flush.
    openFrame=requestAnimationFrame(()=>{
      openFrame=requestAnimationFrame(()=>{openFrame=0;if(!signal.aborted)open()})
    })
  },{signal})
  const syncLock=()=>{
    const open=mobile.matches&&explorer.classList.contains('is-loaded')&&explorer.getAttribute('aria-expanded')==='true'&&!explorer.classList.contains('collapsed')
    clearTimeout(closeTimer);closeTimer=undefined
    if(open)prepareOpen()
    else if(unlock&&mobile.matches){
      // Keep the shared drawer's viewport anchor and toolbar until its CSS slide finishes.
      closeTimer=setTimeout(releaseLock,200)
    }else releaseLock()
  }
  content?.addEventListener('transitionend',event=>{
    if(event.target===content&&event.propertyName==='transform'&&explorer.classList.contains('collapsed'))releaseLock()
  },{signal})
  const leave=()=>{if(mobile.matches){explorer.classList.add('collapsed');explorer.setAttribute('aria-expanded','false');menu()?.setAttribute('aria-expanded','false');document.documentElement.classList.remove('mobile-no-scroll')}releaseLock()}
  const observer=new MutationObserver(syncLock);observer.observe(explorer,{attributes:true,attributeFilter:['class','aria-expanded']})
  mobile.addEventListener('change',syncLock,{signal});document.addEventListener('prenav',leave,{signal})
  signal.addEventListener('abort',()=>{observer.disconnect();releaseLock();content?.removeAttribute('popover')},{once:true});syncLock()
  const blocked='a[href],button,input,textarea,select,label,summary,[role="button"],[role="link"],[role="slider"],[role="textbox"],[contenteditable]:not([contenteditable="false"]),video,audio,iframe,dialog,[role="dialog"],.folder-icon,.global-graph-outer,[data-tag-nebula],.search-container,.friend-letter,.friend-bubble,.friend-rope,.video-player-stage,.drive-preview,[data-directory-list],[data-directory-swipe-ignore]'
  let swipeFrame=0
  signal.addEventListener('abort',()=>cancelAnimationFrame(swipeFrame),{once:true})
  let gesture:{id:number;x:number;y:number;open:boolean;intent:'horizontal'|null}|undefined
  const button=()=>explorer.querySelector<HTMLButtonElement>('.mobile-explorer')
  document.addEventListener('touchstart',event=>{
    gesture=undefined
    if(!mobile.matches||event.touches.length!==1||!explorer.classList.contains('is-loaded')||!button()?.getClientRects().length)return
    const target=event.composedPath?.().find(node=>node instanceof Element)??event.target
    if(!(target instanceof Element)||target.closest(blocked)||document.querySelector('dialog[open]'))return
    const popover=target.closest('[popover]')
    if(popover&&popover!==content)return
    if(window.getSelection()?.isCollapsed===false)return
    const open=!explorer.classList.contains('collapsed')
    if(open&&target.closest('.explorer-content')!==content)return
    const touch=event.touches[0]
    // Preserve native horizontal scrolling, but ordinary text, images and SVG are swipeable.
    for(let node:Element|null=target;node&&node!==content;node=node.parentElement){
      if(node.scrollWidth>node.clientWidth+1&&/^(auto|scroll)$/.test(getComputedStyle(node).overflowX))return
    }
    // Leave the browser's edge-back gesture available.
    if(!open&&touch.clientX<24)return
    gesture={id:touch.identifier,x:touch.clientX,y:touch.clientY,open,intent:null}
  },{signal,passive:true,capture:true})
  document.addEventListener('touchmove',event=>{
    if(!gesture)return
    const touch=Array.from(event.touches).find(item=>item.identifier===gesture!.id)
    if(!touch||event.touches.length!==1){gesture=undefined;return}
    const dx=touch.clientX-gesture.x,dy=touch.clientY-gesture.y
    if(!gesture.intent){
      const intent=directorySwipeIntent(dx,dy)
      if(intent==='vertical'||(intent==='horizontal'&&(gesture.open?dx>0:dx<0))){gesture=undefined;return}
      gesture.intent=intent
    }
    if(gesture.intent==='horizontal'&&event.cancelable)event.preventDefault()
  },{signal,passive:false,capture:true})
  document.addEventListener('touchend',event=>{
    const current=gesture;gesture=undefined
    if(!current||!mobile.matches||current.open===explorer.classList.contains('collapsed'))return
    const touch=Array.from(event.changedTouches).find(item=>item.identifier===current.id)
    if(!touch)return
    const dx=touch.clientX-current.x,dy=touch.clientY-current.y
    if(Math.abs(dx)<44||Math.abs(dy)>Math.abs(dx)*1.8||current.intent!=='horizontal')return
    if(current.open?dx<0:dx>0){
      // Finish the native touch before moving the menu button into the drawer.
      // Suppress its synthetic click, which can hit a newly revealed disclosure.
      if(event.cancelable)event.preventDefault()
      cancelAnimationFrame(swipeFrame)
      swipeFrame=requestAnimationFrame(()=>{if(!signal.aborted)button()?.click()})
    }
  },{signal,passive:false,capture:true})
  document.addEventListener('touchcancel',()=>{gesture=undefined},{signal,passive:true,capture:true})
  signal.addEventListener('abort',()=>{gesture=undefined},{once:true})
}
