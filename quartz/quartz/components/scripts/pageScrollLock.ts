import {sharedState} from './sharedRequest'
type Snapshot={element:HTMLElement;values:[string,string,string][]}
const state=sharedState('page-scroll-lock:v2',()=>({owners:new Map<symbol,{reset:boolean;fixed:boolean}>(),saved:[] as Snapshot[],scroll:{left:0,top:0},fixed:false}))
// Drawers/fullscreen retain Safari fixed-body locking; lightboxes preserve layout.
export function lockPageScroll(options:{reset?:boolean;signal?:AbortSignal;preserveLayout?:boolean}={}){
 if(options.signal?.aborted)return ()=>{}
 const owner=Symbol(),html=document.documentElement,body=document.body
 const fixedProperties=['position','top','left','width','height']
 if(!state.owners.size){
  state.scroll={left:window.scrollX,top:window.scrollY};state.fixed=false
  const properties=['overflow','overflow-x','overflow-y','overscroll-behavior',...fixedProperties,'scrollbar-gutter']
  state.saved=[html,body].map(element=>({element,values:properties.map(name=>[name,element.style.getPropertyValue(name),element.style.getPropertyPriority(name)])}))
  if(window.innerWidth-html.clientWidth>0)html.style.setProperty('scrollbar-gutter','stable','important')
  html.style.setProperty('overflow','hidden','important');html.style.setProperty('overscroll-behavior','none','important')
  body.style.setProperty('overscroll-behavior','none','important')
 }
 state.owners.set(owner,{reset:!!options.reset,fixed:!options.preserveLayout})
 const position=()=>{
  const fixed=[...state.owners.values()].some(value=>value.fixed)
  if(fixed){
   body.style.setProperty('overflow','hidden','important')
   body.style.setProperty('position','fixed','important');body.style.setProperty('left','0','important');body.style.setProperty('width','100%','important');body.style.setProperty('height','100%','important')
   body.style.setProperty('top',[...state.owners.values()].some(value=>value.reset)?'0':`${-state.scroll.top}px`,'important')
  }else if(state.fixed){
   for(const[name,value,priority]of state.saved.find(item=>item.element===body)!.values){if(![...fixedProperties,'overflow','overflow-x','overflow-y'].includes(name))continue;if(value)body.style.setProperty(name,value,priority);else body.style.removeProperty(name)}
   window.scrollTo({...state.scroll,behavior:'instant'})
  }
  state.fixed=fixed
 }
 position()
 let released=false
 const release=()=>{
  if(released)return;released=true;options.signal?.removeEventListener('abort',release);state.owners.delete(owner)
  if(state.owners.size){position();return}
  for(const {element,values}of state.saved)for(const[name,value,priority]of values){if(value)element.style.setProperty(name,value,priority);else element.style.removeProperty(name)}
  state.saved=[];state.fixed=false;window.scrollTo({...state.scroll,behavior:'instant'})
 }
 options.signal?.addEventListener('abort',release,{once:true})
 return release
}
