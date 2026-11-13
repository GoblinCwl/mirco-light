import {test} from 'node:test'
import assert from 'node:assert/strict'
import {setupReadingSpace,setupReadingHorizon} from './readingSpace'

function environment(){
 const state={width:390,lvh:800,innerHeight:640,rootHeight:3000,theme:'dark',locked:false}
 const frames=new Map<number,FrameRequestCallback>();let next=0
 const listeners=new Map<string,Set<EventListener>>()
 const context={fillStyle:'',globalAlpha:1,beginPath(){},arc(){},fill(){},moveTo(){},lineTo(){},closePath(){},setTransform(){},clearRect(){},drawImage(){}}
 class Element {
  className='';style:Record<string,string>={};children:Element[]=[];parent:Element|null=null;attrs=new Map<string,string>();draws=0;allocations=0;private w=0;private h=0
  constructor(readonly tag:string){}
  get width(){return this.w}set width(value:number){this.w=value;this.allocations++}
  get height(){return this.h}set height(value:number){this.h=value;this.allocations++}
  get clientHeight(){return this.className==='reading-space-layer'?state.lvh:state.rootHeight}
  getContext(){return {...context,drawImage:()=>{this.draws++}}}
  setAttribute(key:string,value:string){this.attrs.set(key,value)}
  removeAttribute(key:string){this.attrs.delete(key)}
  toggleAttribute(key:string,force:boolean){if(force)this.attrs.set(key,'');else this.attrs.delete(key)}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);this.parent=null}
  append(...nodes:Element[]){for(const node of nodes){node.remove();node.parent=this;this.children.push(node)}}
  before(node:Element){const parent=this.parent;if(!parent)return;node.remove();const index=parent.children.indexOf(this);node.parent=parent;parent.children.splice(index,0,node)}
  replaceChildren(...nodes:Element[]){for(const node of [...this.children])node.remove();this.append(...nodes)}
  querySelector(selector:string):Element|null {for(const child of this.children){if((selector==='canvas.reading-space'&&child.tag==='canvas'&&child.className==='reading-space')||(selector.startsWith('.')&&child.className.split(' ').includes(selector.slice(1))))return child;const nested=child.querySelector(selector);if(nested)return nested}return null}
  getBoundingClientRect(){return {left:16,right:state.width-16,top:80,bottom:80+state.rootHeight,width:state.width-32,height:state.rootHeight}}
 }
 const sizes:SizeObserver[]=[],themes:ThemeObserver[]=[],intersections:VisibilityObserver[]=[]
 class SizeObserver{targets=new Set<Element>();disconnected=false;constructor(readonly callback:()=>void){sizes.push(this)}observe(target:Element){this.targets.add(target)}disconnect(){this.disconnected=true;this.targets.clear()}}
 class ThemeObserver{disconnected=false;constructor(readonly callback:()=>void){themes.push(this)}observe(){}disconnect(){this.disconnected=true}}
 class VisibilityObserver{disconnected=false;constructor(readonly callback:(entries:{isIntersecting:boolean}[])=>void,readonly options:IntersectionObserverInit){intersections.push(this)}observe(){}disconnect(){this.disconnected=true}}
 const document={documentElement:{classList:{contains:()=>state.locked},get clientWidth(){return state.width},getAttribute:()=>state.theme},createElement:(tag:string)=>new Element(tag)}
 const window={addEventListener:(type:string,listener:EventListener,options:{signal:AbortSignal})=>{const group=listeners.get(type)||new Set();group.add(listener);listeners.set(type,group);options.signal.addEventListener('abort',()=>group.delete(listener),{once:true})}}
 const globals:Record<string,unknown>={document,window,ResizeObserver:SizeObserver,MutationObserver:ThemeObserver,IntersectionObserver:VisibilityObserver,devicePixelRatio:1,requestAnimationFrame:(callback:FrameRequestCallback)=>{frames.set(++next,callback);return next},cancelAnimationFrame:(id:number)=>frames.delete(id)}
 const previous=new Map<string,PropertyDescriptor|undefined>()
 for(const [key,value]of Object.entries(globals)){previous.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value})}
 previous.set('innerHeight',Object.getOwnPropertyDescriptor(globalThis,'innerHeight'));Object.defineProperty(globalThis,'innerHeight',{configurable:true,get:()=>state.innerHeight})
 const root=new Element('section'),canvas=new Element('canvas'),scene=new Element('div');canvas.className='reading-space';scene.className='reading-horizon-scene';root.append(canvas,scene)
 return {state,root,canvas,scene,sizes,themes,intersections,listeners,flush(){const pending=[...frames.values()];frames.clear();for(const callback of pending)callback(0)},resize(){for(const listener of listeners.get('resize')||[])listener(new Event('resize'))},restore(){for(const [key,descriptor]of previous){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else Reflect.deleteProperty(globalThis,key)}}}
}

test('mobile browser controls and appended pages do not redraw or recreate the star field',()=>{
 const env=environment(),controller=new AbortController()
 try{
  setupReadingSpace(env.root as unknown as HTMLElement,controller.signal)
  assert.equal(env.canvas.draws,1)
  const allocations=env.canvas.allocations,twinkles=env.root.querySelector('.reading-space-twinkles')!,stars=[...twinkles.children]
  env.state.innerHeight=720;env.resize();env.flush()
  assert.equal(env.canvas.draws,1,'address-bar resize rebuilt the star texture')
  assert.equal(env.canvas.allocations,allocations,'address-bar resize reset the bitmap')
  assert.deepEqual(twinkles.children,stars,'twinkle phases restarted')
  env.state.rootHeight=9000
  for(const observer of env.sizes)if(observer.targets.has(env.root))observer.callback()
  env.flush()
  assert.equal(env.canvas.draws,1,'pagination invalidated the background')
  assert.equal(env.listeners.has('scroll'),false,'background still performs per-scroll JS work')
  env.state.width=800;env.state.lvh=400;env.resize();env.flush()
  assert.equal(env.canvas.draws,2,'orientation change must resize the texture')
  env.state.theme='light';env.themes[0].callback();env.flush()
  assert.equal(env.canvas.draws,3,'theme change must repaint colors')
  controller.abort()
  assert.ok(env.sizes[0].disconnected&&env.themes[0].disconnected)
  assert.equal(env.root.querySelector('canvas.reading-space'),env.canvas)
 }finally{controller.abort();env.restore()}
})

test('black hole entrance re-arms only when its scene leaves the viewport',()=>{
 const env=environment(),controller=new AbortController()
 try{
  setupReadingHorizon(env.root as unknown as HTMLElement,controller.signal)
  const observer=env.intersections[0]
  assert.equal(observer.options.rootMargin,"200px 0px 0px 0px",'return entrance must start before the black hole becomes visible')
  assert.equal(env.scene.attrs.has('data-horizon-ready'),false,'entrance must wait for first visibility observation')
  observer.callback([{isIntersecting:true}]);assert.equal(env.scene.attrs.has('data-horizon-outside'),false);assert.equal(env.scene.attrs.has('data-horizon-ready'),true)
  env.state.locked=true;observer.callback([{isIntersecting:false}]);assert.equal(env.scene.attrs.has('data-horizon-outside'),false,'drawer scroll lock must not restart the horizon')
  env.state.locked=false
  observer.callback([{isIntersecting:false}]);assert.equal(env.scene.attrs.has('data-horizon-outside'),true)
  observer.callback([{isIntersecting:true}]);assert.equal(env.scene.attrs.has('data-horizon-outside'),false);assert.equal(env.scene.attrs.has('data-horizon-ready'),true)
  controller.abort();assert.ok(observer.disconnected);assert.equal(env.scene.attrs.has('data-horizon-ready'),false)
 }finally{controller.abort();env.restore()}
})
