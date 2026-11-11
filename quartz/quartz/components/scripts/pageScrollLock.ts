import {sharedState} from './sharedRequest'
type Snapshot={element:HTMLElement;values:[string,string,string][]}
const state=sharedState('page-scroll-lock:v1',()=>({owners:new Map<symbol,boolean>(),saved:[] as Snapshot[],scroll:{left:0,top:0}}))
// Fixed-body locking also prevents Safari rubber-banding the document behind an overlay.
export function lockPageScroll(options:{reset?:boolean;signal?:AbortSignal}={}){
 if(options.signal?.aborted)return ()=>{}
 const owner=Symbol(),html=document.documentElement,body=document.body
 if(!state.owners.size){
  state.scroll={left:window.scrollX,top:window.scrollY}
  const properties=['overflow','overflow-x','overflow-y','overscroll-behavior','position','top','left','width','height','scrollbar-gutter']
  state.saved=[html,body].map(element=>({element,values:properties.map(name=>[name,element.style.getPropertyValue(name),element.style.getPropertyPriority(name)])}))
  html.style.setProperty('overflow','hidden','important');html.style.setProperty('overscroll-behavior','none','important')
  body.style.setProperty('position','fixed','important');body.style.setProperty('left','0','important');body.style.setProperty('width','100%','important');body.style.setProperty('height','100%','important');body.style.setProperty('overflow','hidden','important');body.style.setProperty('overscroll-behavior','none','important')
 }
 state.owners.set(owner,!!options.reset)
 const position=()=>body.style.setProperty('top',[...state.owners.values()].some(Boolean)?'0':`${-state.scroll.top}px`,'important')
 position()
 let released=false
 const release=()=>{
  if(released)return;released=true;options.signal?.removeEventListener('abort',release);state.owners.delete(owner)
  if(state.owners.size){position();return}
  for(const {element,values}of state.saved)for(const[name,value,priority]of values){if(value)element.style.setProperty(name,value,priority);else element.style.removeProperty(name)}
  state.saved=[];window.scrollTo({...state.scroll,behavior:'instant'})
 }
 options.signal?.addEventListener('abort',release,{once:true})
 return release
}
