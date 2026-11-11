import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {runInNewContext} from 'node:vm'

class Modal extends EventTarget {
 open=false;removed=false;innerHTML='';textContent='';style:Record<string,string>={};children:any[]=[]
 className='';classList={add:()=>{}}
 nodes=new Map<string,Modal>()
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
