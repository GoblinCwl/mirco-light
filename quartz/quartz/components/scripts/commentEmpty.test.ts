import {test} from 'node:test'
import assert from 'node:assert/strict'
import {commentEmpty} from './commentEmpty'

test('Bilibili empty state uses the configured Artalk message and shares the configuration request',async()=>{
 const originalFetch=globalThis.fetch,originalDocument=globalThis.document
 let requests=0
 Object.assign(globalThis,{document:{createElement:()=>({className:'',textContent:''})},fetch:async(url:string)=>{assert.equal(url,'/artalk/api/v2/conf');requests++;return new Response(JSON.stringify({frontend_conf:{noComment:'「如无必要，勿增实体。」'}}),{status:200})}})
 try{
  const signal=new AbortController().signal,[first,second]=await Promise.all([commentEmpty(signal),commentEmpty(signal)])
  assert.equal(requests,1);assert.equal(first.className,'atk-list-no-comment');assert.equal(first.textContent,'「如无必要，勿增实体。」');assert.equal(second.textContent,first.textContent)
 }finally{Object.assign(globalThis,{fetch:originalFetch,document:originalDocument})}
})
