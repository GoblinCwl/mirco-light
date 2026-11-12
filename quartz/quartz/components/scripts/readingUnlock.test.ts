import {test} from 'node:test'
import assert from 'node:assert/strict'
import {rememberReadingUnlock,readingExcerpt} from './readingUnlock'
import type {ReadingItem} from './readingView'
const item:ReadingItem={id:'test',type:'article',title:'Private',href:'/Memo/private',excerpt:'',tags:[],encrypted:true,updatedAt:null,createdAt:null}
test('locked articles are hidden until successfully decrypted in this tab',()=>{
 assert.equal(readingExcerpt(item),null)
 rememberReadingUnlock('/Memo/private','已经解密的内容')
 assert.equal(readingExcerpt(item),'已经解密的内容')
 assert.equal(readingExcerpt({...item,encrypted:false,excerpt:'解锁前的索引'}),'已经解密的内容')
})
test('previews expire and do not outlive a newer encrypted article revision',()=>{
 const original=Date.now;let now=original();Date.now=()=>now
 try{
  rememberReadingUnlock('/Memo/expired','text');now+=12*60*60*1000+1
  assert.equal(readingExcerpt({...item,href:'/Memo/expired'}),null)
  rememberReadingUnlock('/Memo/revised','old text')
  assert.equal(readingExcerpt({...item,href:'/Memo/revised',updatedAt:new Date(now+1000).toISOString()}),null)
 }finally{Date.now=original}
})

 test('all protected sources stay hidden until validated, including Share',()=>{
  const share={...item,type:'share' as const,href:'/Share/分享/locked/',excerpt:'解锁前的旧正文'}
  assert.equal(readingExcerpt(share),null)
  rememberReadingUnlock(share.href,'成功验证后读取到的新正文')
  assert.equal(readingExcerpt(share),'成功验证后读取到的新正文')
 })
 test('inline encrypted placeholders stay hidden until the decrypted text arrives',()=>{
  const partial={...item,href:'/Memo/meld',encrypted:false,excerpt:'开头 [加密文本] 旧索引'}
  assert.equal(readingExcerpt(partial),null)
  rememberReadingUnlock(partial.href,'局部解密后的正文')
  assert.equal(readingExcerpt(partial),'局部解密后的正文')
 })

test('validated decrypted previews retain enough bounded prose for tall cards',()=>{
 const href='/Memo/long-unlocked',text='文'.repeat(3000)
 rememberReadingUnlock(href,text)
 assert.equal(Array.from(readingExcerpt({...item,href})!).length,2400)
})
