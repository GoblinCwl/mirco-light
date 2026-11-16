import {test} from 'node:test'
import assert from 'node:assert/strict'
import {hoverDismissal} from './hoverDismissal'
const wait=()=>new Promise(resolve=>setTimeout(resolve,35))
test('moving through the gap and entering the preview cancels dismissal',async()=>{
 let closed=0
 const hover=hoverDismissal(()=>closed++,()=>false,10)
 hover.schedule();assert.equal(closed,0)
 hover.cancel();await wait();assert.equal(closed,0)
 hover.schedule();await wait();assert.equal(closed,1)
})
test('pointer inside the preview or its iframe prevents dismissal',async()=>{
 let closed=0,inside=true
 const hover=hoverDismissal(()=>closed++,()=>inside,10)
 hover.schedule();await wait();assert.equal(closed,0)
 inside=false;hover.schedule();await wait();assert.equal(closed,1)
 hover.cancel()
})
