import {lockPageScroll} from './pageScrollLock'
import {sharedState} from './sharedRequest'
const state=sharedState('view-image-lock:v1',()=>({started:false,owners:new Map<HTMLElement,()=>void>()}))
if(!state.started){
 state.started=true
 document.addEventListener('view-image-open',event=>{
  const overlay=(event as CustomEvent).detail?.overlay
  if(!(overlay instanceof HTMLElement)||state.owners.has(overlay))return
  state.owners.set(overlay,lockPageScroll())
 })
 document.addEventListener('view-image-close',event=>{
  const overlay=(event as CustomEvent).detail?.overlay
  state.owners.get(overlay)?.();state.owners.delete(overlay)
 })
 document.addEventListener('nav',()=>{
  for(const [overlay,release] of state.owners){if(overlay instanceof HTMLDialogElement&&overlay.open)overlay.close();overlay.remove();release()}
  state.owners.clear()
 })
}

export default ""
