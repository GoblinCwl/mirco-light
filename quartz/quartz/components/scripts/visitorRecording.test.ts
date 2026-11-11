import {test} from 'node:test'
import assert from 'node:assert/strict'
import {setupVisitorTracking,recordCurrentVisit,waitForVisitorRecord} from './visitorRecording'

const storage=new Map<string,string>()
const document=new EventTarget()
const oldDocument=Object.getOwnPropertyDescriptor(globalThis,'document')
const oldStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage')
Object.defineProperty(globalThis,'document',{configurable:true,value:document})
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>storage.get(key)??null,setItem:(key:string,value:string)=>storage.set(key,value)}})

test('recording is attached once, shares completion and never queries statistics',async()=>{
 const oldFetch=globalThis.fetch;let count=0,recorded=0,complete!:(value:Response)=>void
 const onRecorded=()=>recorded++;document.addEventListener('visitor-recorded',onRecorded)
 globalThis.fetch=(async(input,options)=>{assert.equal(input,'/api/visitors/visit');assert.equal(options?.method,'POST');count++;return new Promise<Response>(resolve=>complete=resolve)}) as typeof fetch
 try{
  setupVisitorTracking();setupVisitorTracking();document.dispatchEvent(new Event('nav'))
  let finished=false;const pending=waitForVisitorRecord().then(()=>finished=true)
  await new Promise(resolve=>setImmediate(resolve));assert.equal(finished,false)
  complete(new Response(JSON.stringify({meteorId:'a'.repeat(24),isNew:true}),{status:200}))
  await pending
  assert.equal(count,1);assert.equal(recorded,1);assert.equal(storage.get('quartz-visitor-meteor-id'),'a'.repeat(24))
 }finally{globalThis.fetch=oldFetch;document.removeEventListener('visitor-recorded',onRecorded)}
})
test('a stalled record does not hold initial statistics indefinitely',async()=>{
 const oldFetch=globalThis.fetch;let complete!:(value:Response)=>void
 globalThis.fetch=(()=>new Promise<Response>(resolve=>complete=resolve)) as typeof fetch
 try{
  const pending=recordCurrentVisit();await waitForVisitorRecord(5)
  complete(new Response(null,{status:202}));await pending
 }finally{globalThis.fetch=oldFetch}
})
test('superseded navigation responses do not request repeated statistics refreshes',async()=>{
 const oldFetch=globalThis.fetch;const complete:((value:Response)=>void)[]=[];let recorded=0
 const onRecorded=()=>recorded++;document.addEventListener('visitor-recorded',onRecorded)
 globalThis.fetch=(()=>new Promise<Response>(resolve=>complete.push(resolve))) as typeof fetch
 try{
  const old=recordCurrentVisit(),latest=recordCurrentVisit()
  complete[1](new Response(JSON.stringify({meteorId:'a'.repeat(24),isNew:false}),{status:200}));await latest
  complete[0](new Response(JSON.stringify({meteorId:'a'.repeat(24),isNew:false}),{status:200}));await old
  assert.equal(recorded,1)
 }finally{
  globalThis.fetch=oldFetch;document.removeEventListener('visitor-recorded',onRecorded)
  if(oldDocument)Object.defineProperty(globalThis,'document',oldDocument);else Reflect.deleteProperty(globalThis,'document')
  if(oldStorage)Object.defineProperty(globalThis,'localStorage',oldStorage);else Reflect.deleteProperty(globalThis,'localStorage')
 }
})
