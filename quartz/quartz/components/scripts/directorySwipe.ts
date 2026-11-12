import {lockPageScroll} from './pageScrollLock'
// Swipe on unused space only; directory links and vertically scrolling content keep their gestures.
export function directorySwipeIntent(dx:number,dy:number):'horizontal'|'vertical'|null {
  const x=Math.abs(dx),y=Math.abs(dy)
  if(x<8&&y<12)return null
  if(y>=12&&y>x*1.35)return 'vertical'
  if(x>=8&&x>=y*.85)return 'horizontal'
  return null
}
export function setupMobileDirectorySwipe(explorer:HTMLElement,signal:AbortSignal) {
  const mobile=matchMedia('(max-width: 800px)')
  let unlock:(()=>void)|undefined,toolbar:HTMLDivElement|undefined,placeholder:Comment|undefined
  const menu=()=>explorer.querySelector<HTMLButtonElement>('.mobile-explorer')
  const restoreToolbar=()=>{const button=menu();if(placeholder&&button)placeholder.replaceWith(button);placeholder=undefined;toolbar?.remove();toolbar=undefined}
  const showToolbar=()=>{
    if(toolbar)return
    const content=explorer.querySelector<HTMLElement>('.explorer-content'),button=menu(),home=document.querySelector<HTMLAnchorElement>('.sidebar.left > .page-title >a')
    if(!content||!button)return
    placeholder=document.createComment('mobile-menu-position');button.before(placeholder)
    toolbar=document.createElement('div');toolbar.className='mobile-directory-heading';toolbar.append(button)
    if(home){const brand=document.createElement('a');brand.href=home.href;brand.textContent=home.textContent;brand.className='mobile-directory-brand internal';brand.dataset.noPopover='true';toolbar.append(brand)}
    content.prepend(toolbar)
  }
  const syncLock=()=>{
    const open=mobile.matches&&explorer.classList.contains('is-loaded')&&explorer.getAttribute('aria-expanded')==='true'&&!explorer.classList.contains('collapsed')
    if(open){showToolbar();if(!unlock)unlock=lockPageScroll({signal})}
    else{restoreToolbar();unlock?.();unlock=undefined}
  }
  const releaseLock=()=>{restoreToolbar();unlock?.();unlock=undefined}
  const leave=()=>{if(mobile.matches){explorer.classList.add('collapsed');explorer.setAttribute('aria-expanded','false');menu()?.setAttribute('aria-expanded','false');document.documentElement.classList.remove('mobile-no-scroll')}releaseLock()}
  const observer=new MutationObserver(syncLock);observer.observe(explorer,{attributes:true,attributeFilter:['class','aria-expanded']})
  mobile.addEventListener('change',syncLock,{signal});document.addEventListener('prenav',leave,{signal})
  signal.addEventListener('abort',()=>{observer.disconnect();releaseLock()},{once:true});syncLock()
  const blocked='a,button,input,textarea,select,label,summary,[role="button"],[contenteditable="true"],pre,code,video,audio,iframe,canvas,svg,img,dialog,[role="dialog"],[popover],.global-graph-outer,[data-tag-nebula],.search-container,.friend-letter,.friend-bubble,.friend-rope,.video-player-stage,.drive-preview,.folder-container,.repo-files-wrap,.repo-code,.repo-diff,[data-directory-list]'
  let gesture:{id:number;x:number;y:number;open:boolean;intent:'horizontal'|null}|undefined
  const button=()=>explorer.querySelector<HTMLButtonElement>('.mobile-explorer')
  document.addEventListener('touchstart',event=>{
    gesture=undefined
    if(!mobile.matches||event.touches.length!==1||!explorer.classList.contains('is-loaded')||!button()?.getClientRects().length)return
    const target=event.target
    if(!(target instanceof Element)||target.closest(blocked)||document.querySelector('dialog[open]'))return
    if(window.getSelection()?.isCollapsed===false)return
    const open=!explorer.classList.contains('collapsed')
    if(open&&!target.closest('.explorer-content'))return
    const touch=event.touches[0]
    for(const node of target.childNodes){
      if(node.nodeType!==Node.TEXT_NODE||!node.textContent?.trim())continue
      const range=document.createRange();range.selectNodeContents(node)
      if(Array.from(range.getClientRects()).some(rect=>touch.clientX>=rect.left-3&&touch.clientX<=rect.right+3&&touch.clientY>=rect.top-3&&touch.clientY<=rect.bottom+3))return
    }
    // Leave the browser's edge-back gesture available.
    if(!open&&touch.clientX<24)return
    gesture={id:touch.identifier,x:touch.clientX,y:touch.clientY,open,intent:null}
  },{signal,passive:true})
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
  },{signal,passive:false})
  document.addEventListener('touchend',event=>{
    const current=gesture;gesture=undefined
    if(!current||!mobile.matches||current.open===explorer.classList.contains('collapsed'))return
    const touch=Array.from(event.changedTouches).find(item=>item.identifier===current.id)
    if(!touch)return
    const dx=touch.clientX-current.x,dy=touch.clientY-current.y
    if(Math.abs(dx)<44||Math.abs(dy)>Math.abs(dx)*1.8||current.intent!=='horizontal')return
    if(current.open?dx<0:dx>0)button()?.click()
  },{signal,passive:true})
  document.addEventListener('touchcancel',()=>{gesture=undefined},{signal,passive:true})
  signal.addEventListener('abort',()=>{gesture=undefined},{once:true})
}
