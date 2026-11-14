import {test,type TestContext} from 'node:test'
import assert from 'node:assert/strict'
import {lockPageScroll} from './pageScrollLock'
class Style {
 values=new Map<string,[string,string]>()
 setProperty(name:string,value:string,priority=''){this.values.set(name,[value,priority])}
 getPropertyValue(name:string){return this.values.get(name)?.[0]||''}
 getPropertyPriority(name:string){return this.values.get(name)?.[1]||''}
 removeProperty(name:string){const old=this.getPropertyValue(name);this.values.delete(name);return old}
}
function fixture(t:TestContext){
 const previousWindow=Object.getOwnPropertyDescriptor(globalThis,'window'),previousDocument=Object.getOwnPropertyDescriptor(globalThis,'document')
 const html={style:new Style()},body={style:new Style()},scrolls:object[]=[]
 html.style.setProperty('overflow-x','clip');body.style.setProperty('top','3px');body.style.setProperty('color','red')
 Object.defineProperty(globalThis,'window',{configurable:true,value:{scrollX:0,scrollY:420,scrollTo:(value:object)=>scrolls.push(value)}})
 Object.defineProperty(globalThis,'document',{configurable:true,value:{documentElement:html,body}})
 t.after(()=>{if(previousWindow)Object.defineProperty(globalThis,'window',previousWindow);else Reflect.deleteProperty(globalThis,'window');if(previousDocument)Object.defineProperty(globalThis,'document',previousDocument);else Reflect.deleteProperty(globalThis,'document')})
 return {html,body,scrolls}
}
test('drawer locking preserves the page offset and restores only the styles it changed',t=>{
 const {body,html,scrolls}=fixture(t),release=lockPageScroll();t.after(release)
 assert.equal(body.style.getPropertyValue('position'),'fixed');assert.equal(body.style.getPropertyValue('top'),'-420px');assert.equal(html.style.getPropertyValue('overflow'),'hidden')
 release();release();assert.equal(body.style.getPropertyValue('position'),'');assert.equal(body.style.getPropertyValue('top'),'3px');assert.equal(body.style.getPropertyValue('color'),'red');assert.equal(html.style.getPropertyValue('overflow-x'),'clip');assert.deepEqual(scrolls,[{left:0,top:420,behavior:'instant'}])
})
test('fullscreen starts at the viewport origin and nested locks do not unlock each other',t=>{
 const {body,scrolls}=fixture(t),drawer=lockPageScroll(),fullscreen=lockPageScroll({reset:true});t.after(()=>{fullscreen();drawer()})
 assert.equal(body.style.getPropertyValue('top'),'0');fullscreen();assert.equal(body.style.getPropertyValue('top'),'-420px');assert.equal(scrolls.length,0);drawer();assert.equal(scrolls.length,1)
})
test('aborting a page releases its lock, and aborted owners cannot acquire one',t=>{
 const {body}=fixture(t),controller=new AbortController(),release=lockPageScroll({signal:controller.signal});t.after(release);controller.abort();assert.equal(body.style.getPropertyValue('position'),'');lockPageScroll({signal:controller.signal})();assert.equal(body.style.getPropertyValue('position'),'')
})

test('lightbox preserves body geometry and reserves the existing scrollbar gutter',t=>{
 const {html,body}=fixture(t)
 Object.assign(window,{innerWidth:1200});Object.assign(html,{clientWidth:1185})
 const release=lockPageScroll({preserveLayout:true});t.after(release)
 assert.equal(body.style.getPropertyValue('position'),'');assert.equal(body.style.getPropertyValue('top'),'3px');assert.equal(body.style.getPropertyValue('width'),'');assert.equal(body.style.getPropertyValue('height'),'')
 assert.equal(html.style.getPropertyValue('scrollbar-gutter'),'stable');assert.equal(html.style.getPropertyValue('overflow'),'hidden')
 release();assert.equal(html.style.getPropertyValue('scrollbar-gutter'),'');assert.equal(body.style.getPropertyValue('top'),'3px')
})
test('nested fixed overlay returns to lightbox layout without unlocking scrolling',t=>{
 const {html,body}=fixture(t),lightbox=lockPageScroll({preserveLayout:true}),drawer=lockPageScroll();t.after(()=>{drawer();lightbox()})
 assert.equal(body.style.getPropertyValue('position'),'fixed');drawer()
 assert.equal(body.style.getPropertyValue('position'),'');assert.equal(body.style.getPropertyValue('top'),'3px');assert.equal(html.style.getPropertyValue('overflow'),'hidden');lightbox()
})
