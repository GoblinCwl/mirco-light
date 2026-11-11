import {test} from 'node:test'
import assert from 'node:assert/strict'
import {jellyfinAutoBitrate} from './jellyfinCapabilities'
test('bitrate probes accept Jellyfin block-rounded responses, cache the result and respect cancellation',async()=>{
 const originalFetch=globalThis.fetch,originalStorage=Object.getOwnPropertyDescriptor(globalThis,'localStorage')
 let calls=0
 const saved=new Map<string,string>()
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>saved.get(key)??null,setItem:(key:string,value:string)=>saved.set(key,value)}})
 globalThis.fetch=async(input)=>{
  calls++;const url=new URL(String(input)),requested=Number(url.pathname.split('/').at(-1))
  return new Response(new Uint8Array(Math.ceil(requested/65536)*65536),{status:200})
 }
 try{
  const rate=await jellyfinAutoBitrate('match',new AbortController().signal)
  assert.ok(rate>1500000);assert.ok(rate<=120000000);assert.equal(calls,3)
  assert.equal(await jellyfinAutoBitrate('next-match',new AbortController().signal),rate);assert.equal(calls,3)
  const abort=new AbortController();abort.abort()
  await assert.rejects(jellyfinAutoBitrate('cancelled',abort.signal))
 }finally{globalThis.fetch=originalFetch;if(originalStorage)Object.defineProperty(globalThis,'localStorage',originalStorage);else delete (globalThis as any).localStorage}
})
