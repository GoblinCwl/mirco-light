import {test} from 'node:test'
import assert from 'node:assert/strict'
import {bindTagOrbitDrag} from './tagOrbitDrag'

class Stage extends EventTarget {
 captures = new Set<number>()
 hasPointerCapture(id:number){return this.captures.has(id)}
 setPointerCapture(id:number){this.captures.add(id)}
 releasePointerCapture(id:number){this.captures.delete(id)}
}
function fixture() {
 const stage=new Stage(),controller=new AbortController(),calls:unknown[][]=[]
 let start:{id:number;x:number;y:number}|undefined
 bindTagOrbitDrag(stage as unknown as HTMLElement,controller.signal,{
  start(id,x,y){start={id,x,y};calls.push(['start',id,x,y])},
  move(id,x,y,threshold){if(!start||start.id!==id)return false;const active=Math.hypot(x-start.x,y-start.y)>=threshold;if(active)calls.push(['move',id,x,y]);return active},
  end(id,inertia){calls.push(['end',id,inertia]);start=undefined},
 })
 const emit=(type:string,properties:Record<string,unknown>)=>{
  const event=new Event(type,{cancelable:true});Object.assign(event,properties);stage.dispatchEvent(event);return event
 }
 return {stage,calls,emit,controller}
}
const touch=(identifier:number,clientX=10,clientY=10)=>({identifier,clientX,clientY})
test('touch orbit drag works without pointer button/isPrimary and prevents scrolling only after movement',()=>{
 const {emit,calls}=fixture()
 assert.equal(emit('touchstart',{touches:[touch(7)]}).defaultPrevented,false)
 assert.equal(emit('touchmove',{touches:[touch(7,11,11)]}).defaultPrevented,false)
 assert.equal(emit('touchmove',{touches:[touch(7,15,25)]}).defaultPrevented,true)
 emit('touchend',{touches:[]})
 assert.deepEqual(calls,[['start',7,10,10],['move',7,15,25],['end',7,true]])
})
test('two-finger zoom cancels orbit without inertia and remains unblocked',()=>{
 const {emit,calls}=fixture()
 emit('touchstart',{touches:[touch(7)]})
 const pinch=emit('touchstart',{touches:[touch(7),touch(8)]})
 assert.equal(pinch.defaultPrevented,false)
 assert.equal(emit('touchmove',{touches:[touch(7,30),touch(8,40)]}).defaultPrevented,false)
 assert.deepEqual(calls,[['start',7,10,10],['end',7,false]])
})
test('touch pointer events do not double-start the gesture and cancellation does not fling',()=>{
 const {emit,calls}=fixture()
 emit('pointerdown',{pointerType:'touch',button:0,pointerId:7,clientX:10,clientY:10})
 emit('touchstart',{touches:[touch(7)]})
 emit('touchcancel',{touches:[]})
 assert.deepEqual(calls,[['start',7,10,10],['end',7,false]])
})
test('mouse drag retains pointer capture and all listeners are removed on disposal',()=>{
 const {stage,emit,calls,controller}=fixture()
 emit('pointerdown',{pointerType:'mouse',button:0,pointerId:1,clientX:10,clientY:10})
 assert.equal(emit('pointermove',{pointerType:'mouse',pointerId:1,clientX:10,clientY:30}).defaultPrevented,true)
 assert.ok(stage.hasPointerCapture(1))
 emit('pointerup',{pointerType:'mouse',pointerId:1})
 assert.equal(stage.hasPointerCapture(1),false)
 controller.abort();const count=calls.length
 emit('touchstart',{touches:[touch(9)]})
 assert.equal(calls.length,count)
})
