import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readPlayerAsset} from './playerAssetCache'
test('versioned fonts persist across reads while non-font resources stay outside that cache',async t=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'caches'),fetch=globalThis.fetch
 const entries=new Map<string,Response>();let downloads=0
 Object.defineProperty(globalThis,'caches',{configurable:true,value:{open:async()=>({match:async(key:string)=>entries.get(key)?.clone(),put:async(key:string,response:Response)=>{entries.set(key,response)}})}})
 globalThis.fetch=async()=>{downloads++;return new Response('font bytes')}
 t.after(()=>{globalThis.fetch=fetch;if(descriptor)Object.defineProperty(globalThis,'caches',descriptor);else Reflect.deleteProperty(globalThis,'caches')})
 const signal=new AbortController().signal,url=new URL('https://site.test/static/vendor/libass-wasm/4.2.4/font.woff2')
 await readPlayerAsset(url,signal);await readPlayerAsset(url,signal);assert.equal(downloads,1)
 await readPlayerAsset(new URL('https://site.test/private/subtitle.vtt'),signal);assert.equal(entries.size,1);assert.equal(downloads,2)
 Object.defineProperty(globalThis,'caches',{configurable:true,value:{open:async()=>{throw Error('storage denied')}}})
 await readPlayerAsset(url,signal);assert.equal(downloads,3)
})
