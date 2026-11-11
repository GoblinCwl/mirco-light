import {test} from 'node:test'
import assert from 'node:assert/strict'
import {retainShareGraph} from './shareGraphPersistence'

test('same-share navigation retains the live graph; leaving its scope clears retention',context=>{
 const previous=['document','location'].map(key=>Object.getOwnPropertyDescriptor(globalThis,key))
 context.after(()=>['document','location'].forEach((key,index)=>{if(previous[index])Object.defineProperty(globalThis,key,previous[index]!);else Reflect.deleteProperty(globalThis,key)}))
 const current={dataset:{} as Record<string,string>,querySelector:()=>({}),removeAttribute:()=>{delete current.dataset.graphRetained},replaceWith:(_slot:unknown)=>{detached++}}
 let detached=0,restored:unknown
 const slot={replaceWith:(value:unknown)=>{restored=value}}
 const doc={querySelector:()=>current,querySelectorAll:()=>[current],createElement:()=>({id:''}),getElementById:()=>slot}
 const next={querySelector:()=>({replaceWith:()=>{}}),createElement:()=>({id:''})} as unknown as Document
 Object.defineProperty(globalThis,'document',{configurable:true,value:doc})
 Object.defineProperty(globalThis,'location',{configurable:true,value:{href:'https://example.com/Share/分享/test/a/'}})
 const restore=retainShareGraph(next,new URL('https://example.com/Share/分享/test/a/b/'))
 assert.equal(detached,1);assert.equal(current.dataset.graphRetained,'')
 restore();assert.equal(restored,current)
 retainShareGraph(next,new URL('https://example.com/Share/分享/other/'))()
 assert.equal(detached,1);assert.equal(current.dataset.graphRetained,undefined)
 retainShareGraph(next,new URL('https://example.com/Memo/'))()
 assert.equal(detached,1)
})
