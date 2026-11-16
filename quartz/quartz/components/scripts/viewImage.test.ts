import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {runInNewContext} from 'node:vm'

class Modal extends EventTarget {
 open=false;removed=false;innerHTML='';textContent='';style:Record<string,string>={};children:any[]=[]
 className='';classList={add:()=>{}}
 nodes=new Map<string,Modal>()
 clientWidth=300;clientHeight=400
 closest(){return null}
 getBoundingClientRect(){return {left:0,top:0,width:300,height:400}}
 setAttribute(){};focus(){}
 append(child:any){this.children.push(child)}
 querySelector(selector:string):Modal {if(!this.nodes.has(selector))this.nodes.set(selector,new Modal());return this.nodes.get(selector)!}
 showModal(){this.open=true}
 close(){this.open=false;this.dispatchEvent(new Event('close'))}
 remove(){this.removed=true}
}
test('lightbox is a native modal and blocks the page until its closing animation finishes',()=>{
 const doc=Object.assign(new EventTarget(),{body:new Modal(),createElement:(tag:string)=>{assert.equal(tag,'dialog');return new Modal()}})
 const state={opened:0,closed:0}
 doc.addEventListener('view-image-open',()=>state.opened++)
 doc.addEventListener('view-image-close',()=>state.closed++)
 class Custom extends Event {detail:any;constructor(type:string,options:any){super(type);this.detail=options.detail}}
 const window:any={setTimeout,clearTimeout}
 runInNewContext(readFileSync(new URL('../../static/view-image.min.js',import.meta.url),'utf8'),{document:doc,window,Image:Modal,Element:Modal,CustomEvent:Custom})
 window.ViewImage.display(['one.png','two.png'],'one.png')
 const modal=doc.body.children[0] as Modal
 assert.equal(modal.open,true);assert.equal(state.opened,1)
 const cancel=new Event('cancel',{cancelable:true});modal.dispatchEvent(cancel)
 assert.equal(cancel.defaultPrevented,true)
 assert.equal(modal.open,true,'closing animation must retain the modal backdrop')
 assert.notEqual(modal.style.pointerEvents,'none','do not expose links under a fading overlay')
 modal.dispatchEvent(new Event('animationend'))
 assert.equal(modal.open,false);assert.equal(modal.removed,true);assert.equal(state.closed,1)
})

test('mobile swipes change images; pinches zoom and one-finger panning does not switch images',()=>{
 const doc=Object.assign(new EventTarget(),{body:new Modal(),createElement:()=>new Modal()})
 class Custom extends Event {detail:any;constructor(type:string,options:any){super(type);this.detail=options.detail}}
 const window:any={setTimeout,clearTimeout}
 runInNewContext(readFileSync(new URL('../../static/view-image.min.js',import.meta.url),'utf8'),{document:doc,window,Image:Modal,Element:Modal,CustomEvent:Custom})
 window.ViewImage.display(['one.png','two.png'],'one.png')
 const modal=doc.body.children[0] as Modal, count=modal.querySelector('.view-image-index'), lead=modal.querySelector('.view-image-lead')
 const touch=(x:number,y:number)=>({clientX:x,clientY:y})
 const send=(type:string,touches:any[])=>{
  const event=new Event(type,{cancelable:true})
  Object.defineProperty(event,'touches',{value:touches})
  modal.dispatchEvent(event)
  return event
 }
 send('touchstart',[touch(250,200)])
 send('touchmove',[touch(100,200)])
 send('touchend',[])
 assert.equal(count.textContent,2)
 send('touchstart',[touch(100,200),touch(200,200)])
 assert.equal(send('touchmove',[touch(50,200),touch(250,200)]).defaultPrevented,true)
 const image=lead.children.at(-1) as Modal
 assert.match(image.style.transform,/scale\(2\)/)
 send('touchend',[touch(250,200)])
 send('touchmove',[touch(150,240)])
 send('touchend',[])
 assert.equal(count.textContent,2,'zoomed panning must not flip to another image')
 assert.match(image.style.transform,/translate\(-100px, 40px\) scale\(2\)/)
 send('touchstart',[touch(150,200),touch(160,200)])
 send('touchmove',[touch(-100,200),touch(500,200)])
 assert.match(image.style.transform,/scale\(5\)/,'zoom has an upper bound')
 send('touchcancel',[])
 modal.close()
})

test('swipe moves both images together and retains the old image until the transition completes',async()=>{
 const animations:any[]=[]
 class AnimatedImage extends Modal {
  animate(frames:any,options:any){animations.push({frames,options});return {finished:Promise.resolve(),cancel(){}}}
 }
 const doc=Object.assign(new EventTarget(),{body:new Modal(),createElement:()=>new Modal()})
 class Custom extends Event {detail:any;constructor(type:string,options:any){super(type);this.detail=options.detail}}
 const window:any={setTimeout,clearTimeout,matchMedia:()=>({matches:false})}
 runInNewContext(readFileSync(new URL('../../static/view-image.min.js',import.meta.url),'utf8'),{document:doc,window,Image:AnimatedImage,Element:Modal,CustomEvent:Custom})
 window.ViewImage.display(['one.png','two.png'],'one.png')
 const modal=doc.body.children[0] as Modal
 const send=(type:string,x?:number)=>{
  const event=new Event(type,{cancelable:true})
  Object.defineProperty(event,'touches',{value:x===undefined?[]:[{clientX:x,clientY:200}]})
  modal.dispatchEvent(event)
 }
 send('touchstart',250);send('touchmove',100)
 assert.match(modal.querySelector('.view-image-lead').children[0].style.transform,/translateX\(-127.5px\)/)
 send('touchend')
 assert.equal(modal.querySelector('.view-image-index').textContent,1,'retain the old image through its outgoing animation')
 assert.equal(animations.length,2,'both animations begin before either one finishes')
 await new Promise(resolve=>setImmediate(resolve))
 assert.equal(modal.querySelector('.view-image-index').textContent,2)
 assert.equal(animations[0].frames[1].transform,'translateX(-300px)')
 assert.equal(animations[1].frames[0].transform,'translateX(172.5px)')
 assert.equal(animations[1].frames[1].transform,'translateX(0px)')
 assert.equal(animations[0].options.duration,animations[1].options.duration)
 assert.ok(animations.every(animation=>animation.frames.every((frame:any)=>!('opacity' in frame))),'neither image fades away during the slide')
 send('touchstart',150);send('touchmove',130);send('touchend')
 await new Promise(resolve=>setImmediate(resolve))
 assert.equal(modal.querySelector('.view-image-index').textContent,2,'a short swipe returns to the current image')
 assert.equal(animations[2].frames[1].transform,'translateX(0px)')
 assert.equal(animations[3].frames[1].transform,'translateX(300px)')
 modal.close()
})
