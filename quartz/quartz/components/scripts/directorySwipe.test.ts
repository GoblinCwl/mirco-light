import {test} from 'node:test'
import assert from 'node:assert/strict'
import {directorySwipeIntent} from './directorySwipe'
test('jitter does not capture taps; predominantly vertical movement keeps native scrolling',()=>{
  assert.equal(directorySwipeIntent(7,4),null)
  assert.equal(directorySwipeIntent(2,8),null)
  assert.equal(directorySwipeIntent(5,70),'vertical')
  assert.equal(directorySwipeIntent(20,45),'vertical')
  assert.equal(directorySwipeIntent(30,45),'vertical')
})
test('natural diagonal swipes lock early in both directions',()=>{
  for(const direction of [1,-1]){
    assert.equal(directorySwipeIntent(direction*10,8),'horizontal')
    assert.equal(directorySwipeIntent(direction*30,25),'horizontal')
    assert.equal(directorySwipeIntent(direction*30,30),'horizontal')
    assert.equal(directorySwipeIntent(direction*30,35),'horizontal')
  }
})
test('unclear direction is not prevented while the user settles into a gesture',()=>{
  assert.equal(directorySwipeIntent(30,40),null)
  assert.equal(directorySwipeIntent(50,60),null)
})

test('accepted swipe uses the existing menu after touch completion and suppresses the trailing click',async()=>{
  const {setupMobileDirectorySwipe}=await import('./directorySwipe')
  const listeners=new Map<string,(event:any)=>void>(),frames=new Map<number,FrameRequestCallback>()
  let sequence=0,clicks=0,prevented=0,collapsed=true
  class Blank {
    childNodes=[{textContent:'ordinary text'}];parentElement=null;scrollWidth=0;clientWidth=0
    constructor(readonly overlay:unknown=null,readonly kind='div',readonly inside=true){}
    closest(selector:string){
      if(selector==='[popover]')return this.overlay
      if(selector==='.explorer-content')return !collapsed&&this.inside?button:null
      return selector.split(',').includes(this.kind)?this:null
    }
  }
  const button={matches:()=>false,removeAttribute(){},addEventListener(){},getClientRects:()=>[{}],click:()=>clicks++}
  const explorer={addEventListener(){},classList:{contains:(name:string)=>name==='is-loaded'||name==='collapsed'&&collapsed},getAttribute:()=> 'false',removeAttribute(){},querySelector:()=>button}
  const previous=new Map<string,PropertyDescriptor|undefined>()
  const globals={
    Element:Blank,
    matchMedia:()=>({matches:true,addEventListener(){}}),
    MutationObserver:class {observe(){}disconnect(){}},
    document:{addEventListener:(type:string,listener:(event:any)=>void)=>listeners.set(type,listener),querySelector:()=>null},
    window:{getSelection:()=>({isCollapsed:true})},
    requestAnimationFrame:(callback:FrameRequestCallback)=>{frames.set(++sequence,callback);return sequence},
    cancelAnimationFrame:(id:number)=>frames.delete(id),
  }
  for(const [key,value]of Object.entries(globals)){previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value})}
  const controller=new AbortController()
  try{
    setupMobileDirectorySwipe(explorer as unknown as HTMLElement,controller.signal)
    const swipe=(direction=1,overlay:unknown=null,kind='div',inside=true)=>{
      listeners.get('touchstart')!({touches:[{identifier:1,clientX:180,clientY:200}],target:new Blank(overlay,kind,inside)})
      listeners.get('touchmove')!({touches:[{identifier:1,clientX:180+60*direction,clientY:202}],cancelable:true,preventDefault(){}})
      listeners.get('touchend')!({changedTouches:[{identifier:1,clientX:180+80*direction,clientY:202}],cancelable:true,preventDefault(){prevented++}})
    }
    swipe()
    assert.equal(clicks,0,'drawer must not move into the still-active native touch')
    assert.equal(prevented,1,'synthetic click must not land on the new drawer contents')
    for(const [id,callback]of frames){frames.delete(id);callback(0)}
    assert.equal(clicks,1,'swipe must activate the same menu button as a tap')
    for(const kind of ['span','svg','img','code','.folder-container']){
      swipe(1,null,kind)
      assert.equal(frames.size,1,`${kind} is non-interactive and should allow opening`)
      for(const [id,callback]of frames){frames.delete(id);callback(0)}
    }
    for(const kind of ['a[href]','button','summary','.folder-icon']){
      swipe(1,null,kind)
      assert.equal(frames.size,0,`${kind} must retain its own interaction`)
    }
    collapsed=false
    const beforeClose=clicks
    for(const kind of ['div','span','svg','.folder-container']){
      swipe(-1,button,kind)
      assert.equal(frames.size,1,`drawer ${kind} should allow left-swipe closing`)
      for(const [id,callback]of frames){frames.delete(id);callback(0)}
    }
    assert.equal(clicks,beforeClose+4)
    swipe(-1,null,'div',false)
    assert.equal(frames.size,0,'covered underlying page must not control the open drawer')
    swipe(-1,{})
    assert.equal(frames.size,0,'unrelated popovers must still keep their gestures')
    swipe(-1,button);controller.abort()
    assert.equal(frames.size,0,'navigation must cancel a pending drawer gesture')
  }finally{
    controller.abort()
    for(const [key,descriptor]of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key)}
  }
})

test('drawer uses the top layer without changing the header, and keeps it through the shared closing transition',async()=>{
  const {setupMobileDirectorySwipe}=await import('./directorySwipe')
  const frames=new Map<number,FrameRequestCallback>();let frame=0,observerCallback=()=>{},opened=0,hidden=0,expanded=0
  class MockStyle {
    values=new Map<string,string>();cssText=''
    getPropertyValue(key:string){return this.values.get(key)||''}getPropertyPriority(){return ''}
    setProperty(key:string,value:string){this.values.set(key,value)}removeProperty(key:string){this.values.delete(key)}
  }
  class MockNode extends EventTarget {
    style=new MockStyle();attrs=new Map<string,string>();children:MockNode[]=[];parent:MockNode|null=null;textContent='';className='';dataset:Record<string,string>={};href='/'
    remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);this.parent=null}
    append(child:MockNode){child.remove();child.parent=this;this.children.push(child)}
    prepend(child:MockNode){child.remove();child.parent=this;this.children.unshift(child)}
    before(child:MockNode){const p=this.parent!;child.remove();child.parent=p;p.children.splice(p.children.indexOf(this),0,child)}
    replaceWith(child:MockNode){this.before(child);this.remove()}
    setAttribute(k:string,v:string){this.attrs.set(k,v)}removeAttribute(k:string){this.attrs.delete(k)}getAttribute(k:string){return this.attrs.get(k)??null}
    getBoundingClientRect(){return {width:34,height:34}}
  }
  const explorer=new MockNode(),button=new MockNode(),content=new MockNode(),body=new MockNode(),html=new MockNode()
  let collapsed=true,popover=false
  const classes={contains:(key:string)=>key==='is-loaded'||key==='collapsed'&&collapsed}
  Object.assign(explorer,{classList:classes,querySelector:(selector:string)=>selector==='.explorer-content'?content:button})
  Object.assign(content,{matches:()=>popover,showPopover:()=>{popover=true;opened++},hidePopover:()=>{popover=false;hidden++}})
  explorer.append(button);explorer.append(content)
  const previous=new Map<string,PropertyDescriptor|undefined>()
  const globals={matchMedia:()=>({matches:true,addEventListener(){}}),MutationObserver:class{constructor(cb:()=>void){observerCallback=cb}observe(){}disconnect(){}},document:{body,documentElement:html,querySelector:()=>null,createElement:()=>new MockNode(),addEventListener(){}},window:{scrollX:0,scrollY:200,scrollTo(){}},requestAnimationFrame:(cb:FrameRequestCallback)=>{frames.set(++frame,cb);return frame},cancelAnimationFrame:(id:number)=>frames.delete(id)}
  for(const [key,value]of Object.entries(globals)){previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value})}
  const lifecycle=new AbortController()
  const flush=()=>{const pending=[...frames.values()];frames.clear();pending.forEach(cb=>cb(0))}
  try{
    setupMobileDirectorySwipe(explorer as unknown as HTMLElement,lifecycle.signal)
    assert.equal(content.attrs.has('popover'),false,'desktop/closed content must not become display:none')
    const request=new Event('directory-before-open',{cancelable:true})
    Object.assign(request,{detail:{open:()=>{expanded++;collapsed=false;explorer.setAttribute('aria-expanded','true');observerCallback()}}})
    assert.equal(explorer.dispatchEvent(request),false)
    assert.equal(opened,1)
    assert.equal(expanded,0)
    assert.equal(button.parent?.className,'mobile-directory-heading')
    assert.equal(explorer.children[0].style.cssText,'display:block;width:34px;height:34px;flex:none')
    flush();assert.equal(expanded,0)
    flush();assert.equal(expanded,1)
    collapsed=true;explorer.setAttribute('aria-expanded','false');observerCallback()
    assert.equal(hidden,0,'closing must retain the same layer until CSS slide finishes')
    const end=new Event('transitionend');Object.assign(end,{propertyName:'transform'});content.dispatchEvent(end)
    assert.equal(hidden,1)
    assert.equal(button.parent,explorer)
    assert.equal(content.attrs.has('popover'),false)
    assert.equal(body.style.values.size,0,'original document scrolling must be restored')
  }finally{
    lifecycle.abort()
    for(const [key,descriptor]of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key)}
  }
})
