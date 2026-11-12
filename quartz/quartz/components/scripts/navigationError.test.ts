import {test} from 'node:test'
import assert from 'node:assert/strict'
import {fetchNavigationPage,SITE_NOT_FOUND_PATH} from './util'

test('only navigation 404s use the separate site page; forbidden pages and working routes retain their response',async()=>{
 const original=globalThis.fetch
 try{
  for(const status of [200,403,404]){
   const calls:string[]=[]
   globalThis.fetch=async(input)=>{const url=String(input);calls.push(url);return new Response(url.includes(SITE_NOT_FOUND_PATH)?'site layout':'original response',{status:url.includes(SITE_NOT_FOUND_PATH)?200:status,headers:{'content-type':'text/html'}})}
   const response=await fetchNavigationPage(new URL('https://example.com/Share/空间/深层目录'))
   assert.equal(await response.text(),status===404?'site layout':'original response')
   assert.equal(calls.length,status===404?2:1)
   if(status===404)assert.equal(calls[1],`https://example.com${SITE_NOT_FOUND_PATH}`)
  }
 }finally{globalThis.fetch=original}
})

test('an absent site error asset cannot loop or replace the existing Nginx fallback',async()=>{
 const original=globalThis.fetch
 try{
  const calls:string[]=[]
  globalThis.fetch=async(input)=>{calls.push(String(input));return new Response('standalone error',{status:404,headers:{'content-type':'text/html'}})}
  const response=await fetchNavigationPage(new URL('https://example.com/missing'))
  assert.equal(response.status,404);assert.equal(await response.text(),'standalone error');assert.equal(calls.length,2)
  calls.length=0
  await fetchNavigationPage(new URL(`https://example.com${SITE_NOT_FOUND_PATH}`))
  assert.equal(calls.length,1)
 }finally{globalThis.fetch=original}
})

test('a direct site 404 response already contains the navigation layout and needs no second request',async()=>{
 const original=globalThis.fetch
 try{
  let calls=0
  globalThis.fetch=async()=>{calls++;return new Response('site layout',{status:404,headers:{'content-type':'text/html','X-Site-Error':'404'}})}
  const response=await fetchNavigationPage(new URL('https://example.com/Study/xxxx'))
  assert.equal(response.status,404)
  assert.equal(await response.text(),'site layout')
  assert.equal(calls,1)
 }finally{globalThis.fetch=original}
})
