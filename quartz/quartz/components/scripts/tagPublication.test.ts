import {test} from 'node:test'
import assert from 'node:assert/strict'
import {waitForTagPublication} from './tagPublication'

test('tag edit waits for the published article rather than accepting the old index',async context=>{
 let reads=0
 context.mock.method(globalThis,'fetch',async()=>Response.json({revision:String(++reads),pages:{note:{id:'article:note',tags:reads===1?[]:['topic/child']}}}))
 await waitForTagPublication(['article:note'],'topic',false,new AbortController().signal)
 assert.equal(reads,2)
})
test('removing a parent tag waits until descendant membership disappears',async context=>{
 let reads=0
 context.mock.method(globalThis,'fetch',async()=>Response.json({revision:String(++reads),pages:{note:{id:'article:note',tags:reads===1?['topic/child']:['unrelated']}}}))
 await waitForTagPublication(['article:note'],'topic',true,new AbortController().signal)
 assert.equal(reads,2)
})
test('leaving the page stops the edit publication wait',async context=>{
 const controller=new AbortController();let reads=0
 context.mock.method(globalThis,'fetch',async()=>{reads++;setTimeout(()=>controller.abort(),10);return Response.json({revision:'old',pages:{note:{id:'article:note',tags:[]}}})})
 await assert.rejects(waitForTagPublication(['article:note'],'topic',false,controller.signal),{name:'AbortError'})
 assert.equal(reads,1)
})
