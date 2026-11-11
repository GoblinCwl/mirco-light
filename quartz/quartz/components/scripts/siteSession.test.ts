import {test} from 'node:test'
import assert from 'node:assert/strict'

test('identity readers coalesce, Share includes permissions, and logout invalidates',async context=>{
 const document=new EventTarget()
 const oldDocument=Object.getOwnPropertyDescriptor(globalThis,'document'),oldLocation=Object.getOwnPropertyDescriptor(globalThis,'location')
 Object.defineProperty(globalThis,'document',{configurable:true,value:document})
 Object.defineProperty(globalThis,'location',{configurable:true,value:{pathname:'/Share/'}})
 context.after(()=>{for(const [name,old]of [['document',oldDocument],['location',oldLocation]] as const){if(old)Object.defineProperty(globalThis,name,old);else Reflect.deleteProperty(globalThis,name)}})
 let calls=0,authenticated=true
 context.mock.method(globalThis,'fetch',async(input:any)=>{
  calls++;assert.equal(String(input),'/api/site/session?share=true')
  return new Response(JSON.stringify({authenticated,share:authenticated?{configured:true,token:'token',user:{role:2,base_path:'/',username:'admin'}}:{configured:false}}))
 })
 const {readSiteSession}=await import('./siteSession')
 const [a,b]=await Promise.all([readSiteSession(),readSiteSession(true)])
 assert.deepEqual(a,b);assert.equal(calls,1)
 await readSiteSession();assert.equal(calls,1)
 authenticated=false;document.dispatchEvent(new Event('stellar-auth-changed'))
 const guest=await readSiteSession();assert.equal(guest.authenticated,false);assert.equal(guest.share?.token,undefined);assert.equal(calls,2)
})
