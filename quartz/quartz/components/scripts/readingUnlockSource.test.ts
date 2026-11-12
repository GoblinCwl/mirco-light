import {test} from 'node:test'
import assert from 'node:assert/strict'
import {webcrypto} from 'node:crypto'
import {resolveReadingExcerpt} from './readingUnlockSource'
import type {ReadingItem} from './readingView'

test('cached article keys decrypt the current payload instead of using locked index text',async()=>{
 const globals=globalThis as any,names=['localStorage','sessionStorage','location','DOMParser','fetch','crypto']
 const saved=names.map(name=>[name,Object.getOwnPropertyDescriptor(globals,name)] as const)
 const store=new Map<string,string>(),storage={get length(){return store.size},key:(index:number)=>[...store.keys()][index]??null,getItem:(key:string)=>store.get(key)??null}
 const salt=webcrypto.getRandomValues(new Uint8Array(32)),iv=webcrypto.getRandomValues(new Uint8Array(16)),tocSalt=new Uint8Array(32)
 const key=await webcrypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt','decrypt'])
 const cipher=new Uint8Array(await webcrypto.subtle.encrypt({name:'AES-GCM',iv},key,new TextEncoder().encode('<p>解密后的真实正文</p>')))
 const bytes=new Uint8Array(48+cipher.length);bytes.set(salt);bytes.set(iv,32);bytes.set(cipher,48)
 const hex=(a:Uint8Array)=>Buffer.from(a).toString('hex')
 const cacheId=`Memo/recover:v2:${hex(salt.slice(0,16))}:${hex(tocSalt.slice(0,16))}`
 const entry=JSON.stringify({key:await webcrypto.subtle.exportKey('jwk',key),expires:Date.now()+60000})
 for(const kind of ['content','toc'])store.set(`quartz-encrypted:${cacheId}:${kind}`,entry)
 const item:ReadingItem={id:'recovery-fixture',type:'article',title:'fixture',href:'/Memo/recover',excerpt:'解锁前的旧正文',encrypted:true,tags:[],updatedAt:null,createdAt:null}
 let requests=0
 class Parser{
  parseFromString(text:string){return text==='article-shell'?{body:{dataset:{slug:'Memo/recover'}},querySelector:()=>({dataset:{cacheId,payloadUrl:'/encrypted.json'}})}:{body:{textContent:'解密后的真实正文'},querySelectorAll:()=>[]}}
 }
 try{
  for(const [name,value]of Object.entries({localStorage:storage,sessionStorage:{...storage,getItem:()=>null},location:{origin:'https://site.invalid'},DOMParser:Parser,crypto:webcrypto,fetch:async(url:string)=>{requests++;return url==='/Memo/recover'?{ok:true,url:'https://site.invalid/Memo/recover',text:async():Promise<string>=> 'article-shell'}:Response.json({content:Buffer.from(bytes).toString('base64'),toc:Buffer.from(new Uint8Array(64)).toString('base64')})}}))Object.defineProperty(globals,name,{value,configurable:true,writable:true})
  assert.equal(await resolveReadingExcerpt(item,new AbortController().signal),'解密后的真实正文')
  assert.equal(requests,2)
  const before=requests
  assert.equal(await resolveReadingExcerpt({...item,id:'no-key',href:'/Memo/no-key'},new AbortController().signal),null)
  assert.equal(requests,before,'locked content without cached keys must not be fetched')
 }finally{for(const[name,descriptor]of saved){if(descriptor)Object.defineProperty(globals,name,descriptor);else delete globals[name]}}
})
