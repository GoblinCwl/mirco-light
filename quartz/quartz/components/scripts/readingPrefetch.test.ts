import {test} from 'node:test'
import assert from 'node:assert/strict'
import {createReadingPrefetch} from './readingPrefetch'
test('preparing and repeated requests share one page until it is revealed',async()=>{
 const requested:number[]=[],buffer=createReadingPrefetch(async page=>{requested.push(page);return {page}})
 const reserved=buffer.reserve()
 assert.equal(buffer.reserve(),reserved)
 assert.deepEqual(await reserved,{page:1})
 assert.equal(buffer.reserve(),reserved,'ready content stays reserved without another request')
 assert.deepEqual(requested,[1])
 assert.deepEqual(await buffer.take(),{page:1})
 assert.deepEqual(await buffer.reserve(),{page:2})
 assert.deepEqual(requested,[1,2])
})
test('a failed background request retries the same page without skipping content',async()=>{
 let fail=true;const requested:number[]=[]
 const buffer=createReadingPrefetch(async page=>{requested.push(page);if(fail)throw Error('offline');return page})
 await assert.rejects(buffer.reserve(),/offline/)
 fail=false
 assert.equal(await buffer.take(),1)
 assert.equal(await buffer.reserve(),2)
 assert.deepEqual(requested,[1,1,2])
})
